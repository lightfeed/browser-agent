import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentActionDefinition } from "./agent/actions/types";

import {
  LocalBrowserProvider,
  ServerlessBrowserProvider,
  RemoteBrowserProvider,
} from "@/browser-providers";

export type BrowserProviders = "Local" | "Serverless" | "Remote";

export interface BrowserAgentConfig<T extends BrowserProviders = "Local"> {
  customActions?: Array<AgentActionDefinition>;

  browserProvider?: T;

  debug?: boolean;
  llm?: BaseChatModel;

  localConfig?: ConstructorParameters<typeof LocalBrowserProvider>[0];
  serverlessConfig?: ConstructorParameters<typeof ServerlessBrowserProvider>[0];
  remoteConfig?: ConstructorParameters<typeof RemoteBrowserProvider>[0];
}
