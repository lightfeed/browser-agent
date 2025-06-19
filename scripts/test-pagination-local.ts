import { BrowserAgent } from "../src/agent";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { TaskStatus } from "../dist/types";

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

  await page.setViewportSize({ width: 1280, height: 1024 });

  await page.route("**/*", (route, request) => {
    const resourceType = request.resourceType();
    if (["image", "video", "media", "font"].includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  await page.goto("https://news.ycombinator.com/");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }

  // Run first extraction
  // --- some extraction code ---
  console.log("Run extraction for page 1");
  let nextPageNumber = 2;
  let hasNextPage = true;
  const maxPage = 3;

  while (hasNextPage && nextPageNumber <= maxPage) {
    const result = await page.ai(
      `Go to page ${nextPageNumber} of the results. If page ${nextPageNumber} does not exist, return early and complete the task.`,
      {
        maxSteps: 3,
        outputSchema: z.object({
          success: z.boolean(),
          currentPageNumber: z.number(),
          hasNextPage: z.boolean(),
        }),
      }
    );
    if (result.status === TaskStatus.COMPLETED) {
      const structuredOutput = JSON.parse(result.output) as {
        success: boolean;
        currentPageNumber: number;
        hasNextPage: boolean;
      };

      if (structuredOutput.currentPageNumber === nextPageNumber) {
        // Run extraction
        // --- some extraction code ---
        console.log(
          "Run extraction for page",
          structuredOutput.currentPageNumber
        );
      } else {
        console.error(
          `Expected page ${nextPageNumber}, but got page ${structuredOutput.currentPageNumber}`
        );
        break;
      }

      if (structuredOutput.hasNextPage) {
        nextPageNumber += 1;
        hasNextPage = true;
      } else {
        console.log(
          "No more pages available at page",
          structuredOutput.currentPageNumber
        );
        break;
      }
    } else {
      console.error("Task failed", JSON.stringify(result, null, 2));
      break;
    }
  }
})();
