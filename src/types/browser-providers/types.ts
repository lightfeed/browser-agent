import { Browser } from "playwright";

abstract class BrowserProvider<T> {
  abstract session: unknown;
  abstract start(): Promise<Browser>;
  abstract close(): Promise<void>;
  abstract getSession(): T | null;
}

export const BrowserProviderType = {
  Local: "Local",
  Remote: "Remote",
  Serverless: "Serverless",
} as const;

export default BrowserProvider;
