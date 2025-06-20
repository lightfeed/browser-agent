import { GoToURLActionDefinition } from "./go-to-url";
import { ClickElementActionDefinition } from "./click-element";
import { InputTextActionDefinition } from "./input-text";
import { CompleteActionDefinition } from "./complete";
import { generateCompleteActionWithOutputDefinition } from "./complete-with-output-schema";
import { ExtractActionDefinition } from "./extract";
import { SelectOptionActionDefinition } from "./select-option";
import { ScrollActionDefinition } from "./scroll";
import { PageBackActionDefinition } from "./page-back";
import { PageForwardActionDefinition } from "./page-forward";
import { KeyPressActionDefinition } from "./key-press";
import { ThinkingActionDefinition } from "./thinking";
import { RefreshPageActionDefinition } from "./refresh-page";
import { PDFActionDefinition } from "./pdf";

/**
 * Custom error class for when an action is not found in the registry
 * This helps distinguish between general errors and specifically when an action type doesn't exist
 */
export class ActionNotFoundError extends Error {
  constructor(actionType: string) {
    super(`Action type "${actionType}" not found in the action registry`);
    this.name = "ActionNotFoundError";

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ActionNotFoundError);
    }
  }
}

const DEFAULT_ACTIONS = [
  GoToURLActionDefinition,
  PageBackActionDefinition,
  PageForwardActionDefinition,
  RefreshPageActionDefinition,
  // --- Extract is handled out of the agent - for now the agent is only supposed to do AI navigation
  // ExtractActionDefinition,
  ClickElementActionDefinition,
  SelectOptionActionDefinition,
  ScrollActionDefinition,
  InputTextActionDefinition,
  KeyPressActionDefinition,
  // --- Disable for now - saw issues with invalid structured output because of this action
  // ThinkingActionDefinition,
];

if (process.env.GEMINI_API_KEY) {
  DEFAULT_ACTIONS.push(PDFActionDefinition);
}

export {
  DEFAULT_ACTIONS,
  CompleteActionDefinition,
  generateCompleteActionWithOutputDefinition,
};
