import { z } from "zod";
import { ActionContext, AgentActionDefinition } from "@/types";
import { resolveLocator } from "./utils";

export const InputTextAction = z
  .object({
    index: z
      .number()
      .describe("The numeric index of the element to input text."),
    text: z.string().describe("The text to input."),
  })
  .describe("Input text into a input interactive element");

export type InputTextActionType = z.infer<typeof InputTextAction>;

export const InputTextActionDefinition: AgentActionDefinition = {
    type: "inputText" as const,
    actionParams: InputTextAction,
    run: async (ctx: ActionContext, action: InputTextActionType) => {
      let { text } = action;
      const { index } = action;
      const resolved = resolveLocator(ctx, index);
      for (const variable of ctx.variables) {
        text = text.replace(`<<${variable.key}>>`, variable.value);
      }
      if (!resolved) {
        return { success: false, message: "Element not found" };
      }
      const { locator, resolved: resolvedLocator } = resolved;
      await locator.fill(text, { timeout: 5_000 });
      return {
        success: true,
        message: `Inputted text "${text}" into element with index ${index}`,
        resolvedLocator,
      };
    },
    pprintAction: function (params: InputTextActionType): string {
      return `Input text "${params.text}" into element at index ${params.index}`;
    },
  };
