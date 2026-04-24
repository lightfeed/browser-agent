import { AgentStep } from "@/types/agent/types";
import fs from "fs";

import {
  ActionContext,
  ActionOutput,
  ActionType,
  AgentActionDefinition,
} from "@/types";
import { getDom } from "@/context-providers/dom";
import { retry } from "@/utils/retry";
import { sleep } from "@/utils/sleep";

import {
  AgentOutput,
  AgentOutputFn,
  endTaskStatuses,
} from "@/types/agent/types";
import {
  TaskParams,
  TaskOutput,
  TaskState,
  TaskStatus,
} from "@/types/agent/types";

import { BrowserAgentError } from "../error";
import { buildAgentStepMessages } from "../messages/builder";
import { getStructuredOutputMethod } from "../llms/structured-output";
import { SYSTEM_PROMPT } from "../messages/system-prompt";
import { z } from "zod";
import { DOMState } from "@/context-providers/dom/types";
import { Page } from "playwright";
import { ActionNotFoundError } from "../actions";
import { AgentCtx } from "./types";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import mergeImages from "merge-images";
import { Canvas, Image } from "canvas";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { LLMResult } from "@langchain/core/outputs";
import { TokenUsage } from "@/types/agent/types";

class TokenTrackingCallbackHandler extends BaseCallbackHandler {
  name = "TokenTrackingCallbackHandler";
  private tokenUsage: TokenUsage | null = null;

  handleLLMEnd(output: LLMResult): void {
    // Extract token usage from the LLM result
    const usage = output.llmOutput?.tokenUsage;
    if (usage) {
      this.tokenUsage = {
        inputTokens: usage.promptTokens || 0,
        outputTokens: usage.completionTokens || 0,
        totalTokens: usage.totalTokens || 0,
      };
    }
  }

  getTokenUsage(): TokenUsage | null {
    return this.tokenUsage;
  }

  reset(): void {
    this.tokenUsage = null;
  }
}

const compositeScreenshot = async (page: Page, overlay: string) => {
  const screenshot = await page.screenshot();
  const screenshotBase64 = `data:image/png;base64,${screenshot.toString("base64")}`;
  const overlayBase64 = `data:image/png;base64,${overlay}`;

  const mergedImage = await mergeImages([screenshotBase64, overlayBase64], {
    Canvas: Canvas,
    Image: Image,
  });

  const base64Result = mergedImage.split(",")[1];
  return base64Result;
};

function isGoogleModel(llm: BaseChatModel): boolean {
  const name = llm.getName();
  return (
    name === "ChatGoogleGenerativeAI" ||
    name === "chat-google-generative-ai"
  );
}

const getActionSchema = (actions: Array<AgentActionDefinition>) => {
  const zodDefs = actions.map((action) =>
    z.object({
      type: z.nativeEnum([action.type] as unknown as z.EnumLike),
      params: action.actionParams,
      actionDescription: z
        .string()
        .describe(
          "Describe why you are performing this action and what you aim to perform with this action."
        ),
    })
  );
  return z.union([zodDefs[0], zodDefs[1], ...zodDefs.splice(2)]);
};

/**
 * Builds a flat action schema compatible with Google Gemini's API,
 * which does not support `anyOf` / `oneOf` in tool declarations.
 * All action types share a single z.object with an enum `type` discriminator
 * and merged optional params.
 */
const getActionSchemaFlat = (actions: Array<AgentActionDefinition>) => {
  const actionTypes = actions.map((a) => a.type) as [string, ...string[]];

  const actionParamDescriptions = actions.map((action) => {
    const shape = (action.actionParams as z.AnyZodObject).shape;
    const entries = Object.entries(shape);
    const actionDesc = action.actionParams.description || "";
    if (entries.length === 0) {
      return `"${action.type}": ${actionDesc} (no params needed)`;
    }
    const paramDescs = entries.map(([key, schema]) => {
      const desc = (schema as z.ZodTypeAny).description || "";
      return `${key} - ${desc}`;
    });
    return `"${action.type}": ${actionDesc}. Params: { ${paramDescs.join(", ")} }`;
  });

  const mergedParams: Record<string, z.ZodTypeAny> = {};
  for (const action of actions) {
    const shape = (action.actionParams as z.AnyZodObject).shape;
    for (const [key, schema] of Object.entries(shape)) {
      if (!mergedParams[key]) {
        let base = schema as z.ZodTypeAny;
        // Unwrap any existing Optional/Nullable so we control the final
        // combination ourselves. Gemini's tool schema does not support
        // `type: ["X", "null"]` unions (produced by `.nullable()`) nor
        // `anyOf`, so we only mark params as `.optional()`.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        while (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (base as any)._def?.typeName === "ZodOptional" ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (base as any)._def?.typeName === "ZodNullable"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          base = (base as any)._def.innerType;
        }
        mergedParams[key] = base.optional();
      }
    }
  }

  return z.object({
    type: z
      .enum(actionTypes)
      .describe(
        "The action type to perform. Available actions: " +
          actionParamDescriptions.join(". ")
      ),
    params: z
      .object(mergedParams)
      .describe("Parameters for the chosen action type"),
    actionDescription: z
      .string()
      .describe(
        "Describe why you are performing this action and what you aim to perform with this action."
      ),
  });
};

const getActionHandler = (
  actions: Array<AgentActionDefinition>,
  type: string
) => {
  const foundAction = actions.find((actions) => actions.type === type);
  if (foundAction) {
    return foundAction.run;
  } else {
    throw new ActionNotFoundError(type);
  }
};

const runAction = async (
  action: ActionType,
  domState: DOMState,
  page: Page,
  ctx: AgentCtx
): Promise<ActionOutput> => {
  const actionCtx: ActionContext = {
    domState,
    page,
    tokenLimit: ctx.tokenLimit,
    llm: ctx.llm,
    debugDir: ctx.debugDir,
    variables: Object.values(ctx.variables),
  };
  const actionType = action.type;
  const actionHandler = getActionHandler(ctx.actions, action.type);
  if (!actionHandler) {
    return {
      success: false,
      message: `Unknown action type: ${actionType}`,
    };
  }
  try {
    return await actionHandler(actionCtx, action.params);
  } catch (error) {
    return {
      success: false,
      message: `Action ${action.type} failed: ${error}`,
    };
  }
};

/**
 * Emit a structured verbose log line. Uses console.log so it shows up in
 * serverless log streams (e.g. AWS CloudWatch) with a stable `[browser-agent]`
 * prefix and a JSON payload that is easy to grep/filter.
 */
const verboseLog = (
  taskId: string,
  event: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): void => {
  try {
    console.log(
      `[browser-agent] ${JSON.stringify({ taskId, event, ...payload })}`
    );
  } catch {
    // Fallback in case payload can't be serialized (e.g. circular refs)
    console.log(`[browser-agent] ${taskId} ${event}`, payload);
  }
};

export const runAgentTask = async (
  ctx: AgentCtx,
  taskState: TaskState,
  params?: TaskParams
): Promise<TaskOutput> => {
  const taskId = taskState.id;
  const debugDir = params?.debugDir || `debug/${taskId}`;
  if (ctx.debug) {
    console.log(`Debugging task ${taskId} in ${debugDir}`);
  }
  if (ctx.verbose) {
    verboseLog(taskId, "task_start", {
      task: taskState.task,
      maxSteps: params?.maxSteps,
    });
  }
  if (!taskState) {
    throw new BrowserAgentError(`Task ${taskId} not found`);
  }

  taskState.status = TaskStatus.RUNNING as TaskStatus;
  if (!ctx.llm) {
    throw new BrowserAgentError("LLM not initialized");
  }
  const actionSchema = isGoogleModel(ctx.llm)
    ? getActionSchemaFlat(ctx.actions)
    : getActionSchema(ctx.actions);
  const llmStructured = ctx.llm.withStructuredOutput(
    AgentOutputFn(actionSchema),
    {
      method: getStructuredOutputMethod(ctx.llm),
    }
  );
  const baseMsgs = [{ role: "system", content: SYSTEM_PROMPT }];

  let output = "";
  const page = taskState.startingPage;
  let startingUrl: string | undefined;
  try {
    const url = page.url();
    if (url && url !== "about:blank") {
      startingUrl = url;
    }
  } catch {
    // page may be closed or otherwise unavailable; skip
  }
  let currStep = 0;
  while (true) {
    // Status Checks
    if ((taskState.status as TaskStatus) == TaskStatus.PAUSED) {
      await sleep(100);
      continue;
    }
    if (endTaskStatuses.has(taskState.status)) {
      break;
    }
    if (params?.maxSteps && currStep >= params.maxSteps) {
      taskState.status = TaskStatus.CANCELLED;
      break;
    }
    const debugStepDir = `${debugDir}/step-${currStep}`;
    if (ctx.debug) {
      fs.mkdirSync(debugStepDir, { recursive: true });
    }

    // Get DOM State
    const domState = await retry({ func: () => getDom(page) });
    if (!domState) {
      console.log("no dom state, waiting 1 second.");
      await sleep(1000);
      continue;
    }

    const trimmedScreenshot = await compositeScreenshot(
      page,
      domState.screenshot.startsWith("data:image/png;base64,")
        ? domState.screenshot.slice("data:image/png;base64,".length)
        : domState.screenshot
    );

    // Store Dom State for Debugging
    if (ctx.debug) {
      fs.mkdirSync(debugDir, { recursive: true });
      fs.writeFileSync(`${debugStepDir}/elems.txt`, domState.domState);
      if (trimmedScreenshot) {
        fs.writeFileSync(
          `${debugStepDir}/screenshot.png`,
          Buffer.from(trimmedScreenshot, "base64")
        );
      }
    }
    if (ctx.verbose) {
      verboseLog(taskId, "dom_state", {
        step: currStep,
        elems: domState.domState,
      });
      if (trimmedScreenshot && ctx.verboseIncludeScreenshots) {
        verboseLog(taskId, "screenshot", {
          step: currStep,
          screenshotBase64: trimmedScreenshot,
        });
      }
    }

    // Build Agent Step Messages
    const msgs = await buildAgentStepMessages(
      baseMsgs,
      taskState.steps,
      taskState.task,
      page,
      domState,
      trimmedScreenshot as string,
      Object.values(ctx.variables)
    );

    // Store Agent Step Messages for Debugging
    if (ctx.debug) {
      fs.writeFileSync(
        `${debugStepDir}/msgs.json`,
        JSON.stringify(msgs, null, 2)
      );
    }
    if (ctx.verbose) {
      verboseLog(taskId, "msgs", { step: currStep, msgs });
    }

    // Create token tracking callback handler
    const tokenTracker = new TokenTrackingCallbackHandler();

    // Invoke LLM with token tracking
    const agentOutput = (await retry({
      func: () => llmStructured.invoke(msgs, { callbacks: [tokenTracker] }),
    })) as AgentOutput;

    // Get token usage from the callback handler
    const tokenUsage = tokenTracker.getTokenUsage();

    params?.debugOnAgentOutput?.(agentOutput);

    // Status Checks
    if ((taskState.status as TaskStatus) == TaskStatus.PAUSED) {
      await sleep(100);
      continue;
    }
    if (endTaskStatuses.has(taskState.status)) {
      break;
    }

    // Run Actions
    const agentStepActions = agentOutput.actions;
    const actionOutputs: ActionOutput[] = [];
    for (const action of agentStepActions) {
      if (action.type === "complete") {
        taskState.status = TaskStatus.COMPLETED;
        const actionDefinition = ctx.actions.find(
          (actionDefinition) => actionDefinition.type === "complete"
        );
        if (actionDefinition) {
          output =
            (await actionDefinition.completeAction?.(action.params)) ??
            "No complete action found";
        } else {
          output = "No complete action found";
        }
      }
      const actionOutput = await runAction(
        action as ActionType,
        domState,
        page,
        ctx
      );
      actionOutputs.push(actionOutput);
      await sleep(2000); // TODO: look at this - smarter page loading
    }
    const step: AgentStep = {
      idx: currStep,
      agentOutput: agentOutput,
      actionOutputs,
      tokenUsage: tokenUsage || undefined,
    };
    taskState.steps.push(step);
    await params?.onStep?.(step);
    currStep = currStep + 1;

    if (ctx.debug) {
      fs.writeFileSync(
        `${debugStepDir}/stepOutput.json`,
        JSON.stringify(step, null, 2)
      );
    }
    if (ctx.verbose) {
      verboseLog(taskId, "step_output", { step: currStep, stepOutput: step });
    }
  }

  const taskOutput: TaskOutput = {
    status: taskState.status,
    steps: taskState.steps,
    output,
    startingUrl,
  };
  if (ctx.debug) {
    fs.writeFileSync(
      `${debugDir}/taskOutput.json`,
      JSON.stringify(taskOutput, null, 2)
    );
  }
  if (ctx.verbose) {
    verboseLog(taskId, "task_output", { taskOutput });
  }
  await params?.onComplete?.(taskOutput);
  return taskOutput;
};
