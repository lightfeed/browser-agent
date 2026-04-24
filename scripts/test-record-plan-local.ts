import path from "node:path";
import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

dotenv.config();

/**
 * Demo: run a task with `.ai()` once and persist the resulting plan to disk.
 * The generated JSON can later be replayed by `test-replay-plan-local.ts` or
 * the `browseragent replay <file>` CLI without spending any LLM tokens.
 */
(async () => {
  const agent = new BrowserAgent({
    llm: new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "gemini-2.5-flash",
      temperature: 0.0,
    }),
    browserProvider: "Local",
    debug: true,
  });

  const page = await agent.newPage();
  await page.goto("https://news.ycombinator.com/");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }

  const task = "Navigate to show section and go to the second post";
  const result = await page.ai(task, { maxSteps: 5 });

  const planPath = path.resolve(__dirname, "hn-newest.plan.json");
  await agent.savePlan(task, result, planPath);

  console.log(`\nRecorded plan written to: ${planPath}`);
  console.log(`Replay with:`);
  console.log(`  npx ts-node scripts/test-replay-plan-local.ts`);
  console.log(`  # or`);
  console.log(`  npm run cli -- replay ${planPath}`);

  await agent.closeAgent();
})();
