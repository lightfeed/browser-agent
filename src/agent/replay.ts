import fs from "node:fs";
import { Page } from "playwright";

import {
  ActionContext,
  ActionOutput,
  AgentActionDefinition,
  AgentPlan,
  AgentVariable,
  PlannedAction,
  ReplayOptions,
  ResolvedLocator,
  TaskOutput,
} from "@/types";
import { DOMState, InteractiveElement } from "@/context-providers/dom/types";
import { BrowserAgentError } from "./error";
import { sleep } from "@/utils";
import { normalizeXpath } from "./actions/utils";

const PLAN_VERSION = 1 as const;

/**
 * Flatten a TaskOutput into a portable AgentPlan that can be persisted to disk
 * and replayed later without any LLM calls. Actions that are not replayable
 * (e.g. the `complete` sentinel) are excluded.
 */
export function taskOutputToPlan(task: string, output: TaskOutput): AgentPlan {
  const plan: AgentPlan = {
    version: PLAN_VERSION,
    task,
    createdAt: new Date().toISOString(),
    steps: [],
    output: output.output,
    startingUrl: output.startingUrl,
  };

  for (const step of output.steps) {
    const agentActions = step.agentOutput?.actions ?? [];
    const actionOutputs = step.actionOutputs ?? [];
    const len = Math.min(agentActions.length, actionOutputs.length);
    for (let i = 0; i < len; i++) {
      const action = agentActions[i];
      const actionOutput = actionOutputs[i];
      if (!action || !action.type) continue;
      if (action.type === "complete") continue;
      if (actionOutput && actionOutput.success === false) continue;
      const planned: PlannedAction = {
        type: action.type,
        params: (action.params ?? {}) as Record<string, unknown>,
        resolvedLocator: actionOutput?.resolvedLocator,
      };
      plan.steps.push(planned);
    }
  }

  return plan;
}

export async function savePlanToFile(
  task: string,
  output: TaskOutput,
  filePath: string
): Promise<AgentPlan> {
  const plan = taskOutputToPlan(task, output);
  await fs.promises.writeFile(filePath, JSON.stringify(plan, null, 2), "utf8");
  return plan;
}

export async function loadPlanFromFile(filePath: string): Promise<AgentPlan> {
  const raw = await fs.promises.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as AgentPlan;
  if (parsed.version !== PLAN_VERSION) {
    throw new BrowserAgentError(
      `Unsupported plan version ${parsed.version}. Expected ${PLAN_VERSION}.`,
      400
    );
  }
  if (!Array.isArray(parsed.steps)) {
    throw new BrowserAgentError("Plan is missing steps array", 400);
  }
  return parsed;
}

/**
 * Build a synthetic DOMState containing a single entry keyed by `indexKey`
 * that points to a recorded ResolvedLocator. Paired with the ActionContext
 * below this lets existing actions (which look up elements via
 * `ctx.domState.elements.get(index)`) run unchanged during replay.
 */
function buildSyntheticDomState(
  indexKey: number,
  resolved: ResolvedLocator
): DOMState {
  const elements = new Map<number, InteractiveElement>();
  elements.set(indexKey, {
    element: {} as HTMLElement,
    isUnderShadowRoot: resolved.isUnderShadowRoot,
    rect: {} as DOMRect,
    cssPath: resolved.cssPath,
    xpath: resolved.xpath,
  });
  return {
    elements,
    domState: "",
    screenshot: "",
  };
}

function defaultFallbackTask(action: PlannedAction): string {
  switch (action.type) {
    case "clickElement":
      return "Click the same element the previous attempt targeted.";
    case "inputText": {
      const text = (action.params as { text?: string })?.text ?? "";
      return `Input the text "${text}" into the correct field.`;
    }
    case "selectOption": {
      const text = (action.params as { text?: string })?.text ?? "";
      return `Select the option "${text}" from the correct dropdown.`;
    }
    case "scroll": {
      const dir = (action.params as { direction?: string })?.direction ?? "";
      return `Scroll ${dir}.`;
    }
    case "goToUrl": {
      const url = (action.params as { url?: string })?.url ?? "";
      return `Navigate to ${url}.`;
    }
    case "keyPress": {
      const text = (action.params as { text?: string })?.text ?? "";
      return `Press the key "${text}".`;
    }
    case "pageBack":
      return "Go back in browser history.";
    case "pageForward":
      return "Go forward in browser history.";
    case "refreshPage":
      return "Refresh the page.";
    default:
      return `Perform the "${action.type}" action.`;
  }
}

export interface ReplayContext {
  page: Page;
  actions: AgentActionDefinition[];
  tokenLimit: number;
  variables: Record<string, AgentVariable>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  llm?: any;
}

/**
 * Deterministically re-run a recorded AgentPlan without contacting an LLM.
 * Each PlannedAction is dispatched to its registered AgentActionDefinition
 * with a synthesized ActionContext.
 */
export async function replayPlan(
  ctx: ReplayContext,
  plan: AgentPlan,
  opts: ReplayOptions = {},
  aiRunner?: (page: Page, task: string) => Promise<void>
): Promise<void> {
  const page = opts.page ?? ctx.page;
  if (!page) {
    throw new BrowserAgentError("No page available for replay");
  }
  const variables = opts.variables ?? ctx.variables ?? {};

  // If the plan was recorded on a page that was navigated to before .ai()
  // was called, bring the replay page to that URL first. Skip if the page
  // is already on that URL, or if the plan itself begins with goToUrl.
  const firstAction = plan.steps[0];
  const firstIsGoTo = firstAction?.type === "goToUrl";
  const navigateTo = opts.startingUrl ?? plan.startingUrl;
  if (navigateTo && !firstIsGoTo) {
    let currentUrl = "";
    try {
      currentUrl = page.url();
    } catch {
      currentUrl = "";
    }
    if (currentUrl !== navigateTo) {
      await page.goto(navigateTo);
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 10_000 });
      } catch {
        // ignore
      }
    }
  }

  for (const action of plan.steps) {
    const handler = ctx.actions.find((a) => a.type === action.type);
    if (!handler) {
      const err = new BrowserAgentError(
        `Unknown action type "${action.type}" in plan; no registered handler.`
      );
      const decision = (await opts.onError?.(action, err)) ?? "abort";
      if (decision === "abort") throw err;
      continue;
    }

    // Record-time, each step is preceded by DOM map construction which
    // implicitly waits for the page. During replay we skip that, so explicitly
    // wait for the document to reach a usable state before each action.
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    } catch {
      // ignore: page may already be past this state or still loading an SPA
    }

    // For actions that target a specific recorded element, wait briefly for
    // that element to actually appear before dispatching. This makes replay
    // resilient to post-navigation hydration.
    if (action.resolvedLocator) {
      const waitLocator =
        action.resolvedLocator.isUnderShadowRoot &&
        action.resolvedLocator.cssPath
          ? page.locator(action.resolvedLocator.cssPath)
          : action.resolvedLocator.xpath
            ? page.locator(
                `xpath=${normalizeXpath(action.resolvedLocator.xpath)}`
              )
            : page.locator(action.resolvedLocator.cssPath);
      try {
        await waitLocator.first().waitFor({
          state: "attached",
          timeout: opts.stepTimeoutMs ?? 10_000,
        });
      } catch {
        // fall through; the action itself will report a clear error
      }
    }

    const params = action.params ?? {};
    const indexKey =
      typeof (params as { index?: unknown }).index === "number"
        ? ((params as { index: number }).index as number)
        : 0;

    const domState = action.resolvedLocator
      ? buildSyntheticDomState(indexKey, action.resolvedLocator)
      : ({
          elements: new Map<number, InteractiveElement>(),
          domState: "",
          screenshot: "",
        } as DOMState);

    const actionCtx: ActionContext = {
      page,
      domState,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llm: ctx.llm as any,
      tokenLimit: ctx.tokenLimit,
      variables: Object.values(variables),
    };

    let output: ActionOutput;
    try {
      output = await handler.run(actionCtx, params);
    } catch (err) {
      output = {
        success: false,
        message: `Replay action "${action.type}" threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    if (!output.success) {
      if (opts.aiFallback && aiRunner) {
        const task =
          opts.aiFallbackTask?.(action) ?? defaultFallbackTask(action);
        try {
          await aiRunner(page, task);
          await opts.onStep?.(action, {
            success: true,
            message: `Replay fell back to .ai() for "${action.type}"`,
          });
        } catch (err) {
          const wrapped =
            err instanceof Error ? err : new Error(String(err));
          const decision = (await opts.onError?.(action, wrapped)) ?? "abort";
          if (decision === "abort") throw wrapped;
        }
      } else {
        const err = new BrowserAgentError(
          `Replay step "${action.type}" failed: ${output.message}`
        );
        const decision = (await opts.onError?.(action, err)) ?? "abort";
        if (decision === "abort") throw err;
      }
    } else {
      await opts.onStep?.(action, output);
    }

    // Small settle delay between actions, mirrors runAgentTask behaviour.
    await sleep(500);
  }
}
