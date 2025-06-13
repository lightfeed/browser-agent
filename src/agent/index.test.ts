import { HyperAgent } from "./index";
import { HyperagentError } from "./error";

describe("HyperAgent", () => {
  it("should throw if no LLM provider is provided and no OPENAI_API_KEY is set", () => {
    const originalEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(() => new HyperAgent()).toThrow(HyperagentError);
    process.env.OPENAI_API_KEY = originalEnv;
  });
});
