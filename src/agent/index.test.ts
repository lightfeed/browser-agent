import { BrowserAgent } from "./index";
import { BrowserAgentError } from "./error";

describe("BrowserAgent", () => {
  it("should construct without an LLM (replay-only usage allowed)", () => {
    const originalEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(() => new BrowserAgent({})).not.toThrow();
    process.env.OPENAI_API_KEY = originalEnv;
  });

  it("should throw from executeTask if no LLM provider is configured", async () => {
    const originalEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const agent = new BrowserAgent({});
    await expect(agent.executeTask("noop")).rejects.toBeInstanceOf(
      BrowserAgentError
    );
    process.env.OPENAI_API_KEY = originalEnv;
  });
});
