import { BrowserAgent } from "../src/agent";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";

dotenv.config();

const agent = new BrowserAgent({
  browserProvider: "Local",
  debug: true,
  llm: new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini",
  }),
});

(async () => {
  const page = await agent.newPage();
  await page.goto("https://www.loblaws.ca/en/food/bakery/bread/c/28251");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }
  const result = await page.ai(
    `Go to page 2 of the results. If page 2 does not exist, return early and complete the task.

Response format: Return ONLY this JSON with no additional text: {"success": boolean, "hasNextPage": boolean}
- success: true if navigated successfully, false otherwise
- hasNextPage: true if more pages exist after current position`,
    { maxSteps: 3 }
  );
  console.log(result);
})();
