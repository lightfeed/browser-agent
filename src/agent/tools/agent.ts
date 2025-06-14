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

import { AgentOutputFn, endTaskStatuses } from "@/types/agent/types";
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
import { Page } from "rebrowser-playwright-core";
import { ActionNotFoundError } from "../actions";
import { AgentCtx } from "./types";
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
  // Take screenshot and convert to base64
  const screenshot = await page.screenshot();
  const screenshotBase64 = `data:image/png;base64,${screenshot.toString("base64")}`;

  // Prepare overlay as data URL
  const overlayBase64 = `data:image/png;base64,${overlay}`;

  // Merge the images
  const mergedImage = await mergeImages([screenshotBase64, overlayBase64], {
    Canvas: Canvas,
    Image: Image,
  });

  // Extract base64 from data URL (remove "data:image/png;base64," prefix)
  const base64Result = mergedImage.split(",")[1];

  return base64Result;
};

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
  if (!taskState) {
    throw new BrowserAgentError(`Task ${taskId} not found`);
  }

  taskState.status = TaskStatus.RUNNING as TaskStatus;
  if (!ctx.llm) {
    throw new BrowserAgentError("LLM not initialized");
  }
  const llmStructured = ctx.llm.withStructuredOutput(
    AgentOutputFn(getActionSchema(ctx.actions)),
    {
      method: getStructuredOutputMethod(ctx.llm),
    }
  );
  const baseMsgs = [{ role: "system", content: SYSTEM_PROMPT }];

  let output = "";
  const page = taskState.startingPage;
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

    // Create token tracking callback handler
    const tokenTracker = new TokenTrackingCallbackHandler();

    // Invoke LLM with token tracking
    const agentOutput = await retry({
      func: () => llmStructured.invoke(msgs, { callbacks: [tokenTracker] }),
    });

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
  }

  const taskOutput: TaskOutput = {
    status: taskState.status,
    steps: taskState.steps,
    output,
  };
  if (ctx.debug) {
    fs.writeFileSync(
      `${debugDir}/taskOutput.json`,
      JSON.stringify(taskOutput, null, 2)
    );
  }
  await params?.onComplete?.(taskOutput);
  return taskOutput;
};
