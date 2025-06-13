import { BrowserAgent } from "./index";
import { BrowserAgentError } from "./error";

describe("BrowserAgent", () => {
  it("should throw if no LLM provider is provided and no OPENAI_API_KEY is set", () => {
    const originalEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(() => new BrowserAgent()).toThrow(BrowserAgentError);
    process.env.OPENAI_API_KEY = originalEnv;
  });
});
