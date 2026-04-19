import { AgentActionDefinition } from "@/types/agent/actions/types";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentVariable } from "@/types/agent/types";

export interface AgentCtx {
  debugDir?: string;
  debug?: boolean;
  /**
   * When true, log debug artifacts to console.log as structured JSON lines
   * (serverless-friendly alternative to writing debug files to disk).
   */
  verbose?: boolean;
  /**
   * When true AND `verbose` is true, include base64 screenshots in the
   * console output. Off by default because they can be very large.
   */
  verboseIncludeScreenshots?: boolean;
  actions: Array<AgentActionDefinition>;
  tokenLimit: number;
  variables: Record<string, AgentVariable>;
  llm: BaseChatModel;
}
