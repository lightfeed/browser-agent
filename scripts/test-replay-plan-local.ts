import path from "node:path";
import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";

dotenv.config();

/**
 * Demo: replay a plan recorded by `test-record-plan-local.ts` without any
 * LLM involvement. No `llm` is configured on the agent.
 */
(async () => {
  const planPath = path.resolve(__dirname, "hn-newest.plan.json");

  const agent = new BrowserAgent({
    browserProvider: "Local",
    debug: true,
  });

  const page = await agent.newPage();

  console.log(`Replaying plan from: ${planPath}`);
  await agent.replay(planPath, {
    page,
    onStep: (action, output) => {
      console.log(
        `  [${action.type}] ${output.success ? "ok" : "failed"} - ${output.message}`
      );
    },
    onError: (action, err) => {
      console.error(`Step "${action.type}" failed: ${err.message}`);
      return "abort";
    },
  });

  console.log("\nReplay complete. Browser will stay open for 5s.");
  await new Promise((r) => setTimeout(r, 5000));
  await agent.closeAgent();
})();
