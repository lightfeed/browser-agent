import { AgentActionDefinition } from "@/types/agent/actions/types";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentVariable } from "@/types/agent/types";

export interface AgentCtx {
  debugDir?: string;
  debug?: boolean;
  actions: Array<AgentActionDefinition>;
  tokenLimit: number;
  variables: Record<string, AgentVariable>;
  llm: BaseChatModel;
}
