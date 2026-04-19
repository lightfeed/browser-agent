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
  /**
   * When true, the agent will log debug artifacts (DOM elements, messages,
   * per-step output and task output) to `console.log` as structured JSON
   * lines. This is useful for serverless environments (e.g. AWS Lambda) where
   * writing debug files to disk is impractical and logs are the easiest way
   * to inspect behavior.
   */
  verbose?: boolean;
  /**
   * When true AND `verbose` is true, screenshots are also included in the
   * console output as base64 strings. Off by default because PNGs can be
   * very large and expensive to store in log systems like CloudWatch.
   */
  verboseIncludeScreenshots?: boolean;
  llm?: BaseChatModel;

  localConfig?: ConstructorParameters<typeof LocalBrowserProvider>[0];
  serverlessConfig?: ConstructorParameters<typeof ServerlessBrowserProvider>[0];
  remoteConfig?: ConstructorParameters<typeof RemoteBrowserProvider>[0];
}
