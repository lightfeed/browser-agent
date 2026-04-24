import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

dotenv.config();

const agent = new BrowserAgent({
  llm: new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash",
    temperature: 0.0,
  }),
  browserProvider: "Local",
  debug: true,
});

(async () => {
  const page = await agent.newPage();
  await page.goto("https://www.ycombinator.com/companies");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }
  page.ai("Find YC companies in B2B legal industry that are hiring now", {
    maxSteps: 5,
  });
})();
