import { BrowserAgent } from "../src/agent";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const agent = new BrowserAgent({
  browserProvider: "Local",
  debug: true,
  llm: new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4.1-mini",
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
    `Go to page 2 of the results. If page 2 does not exist, return early and complete the task.`,
    {
      maxSteps: 3,
      outputSchema: z.object({
        success: z.boolean(),
        currentPageNumber: z.number(),
        hasNextPage: z.boolean(),
      }),
    }
  );
  console.log(result);
})();
