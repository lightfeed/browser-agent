import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";

dotenv.config();

const agent = new BrowserAgent({
  llm: new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4.1-mini",
  }),
  browserProvider: "Local",
  debug: true,
});

(async () => {
  const page = await agent.newPage();
  await page.goto("https://www.loblaws.ca/en/food/bakery/bread/c/28251");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }
  page.ai("Find pagination links and go to the next page", { maxSteps: 2 });
})();
