import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentActionDefinition } from "./agent/actions/types";

import {
  HyperbrowserProvider,
  LocalBrowserProvider,
  ServerlessBrowserProvider,
} from "@/browser-providers";

export type BrowserProviders = "Local" | "Hyperbrowser" | "Serverless";

export interface HyperAgentConfig<T extends BrowserProviders = "Local"> {
  customActions?: Array<AgentActionDefinition>;

  browserProvider?: T;

  debug?: boolean;
  llm?: BaseChatModel;

  hyperbrowserConfig?: Omit<
    NonNullable<ConstructorParameters<typeof HyperbrowserProvider>[0]>,
    "debug"
  >;
  localConfig?: ConstructorParameters<typeof LocalBrowserProvider>[0];
  serverlessConfig?: ConstructorParameters<typeof ServerlessBrowserProvider>[0];
}
