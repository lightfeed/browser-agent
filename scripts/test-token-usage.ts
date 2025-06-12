import { HyperAgent } from "../src/agent";
import chalk from "chalk";

(async () => {
  console.log(chalk.cyan.bold("Testing Token Usage Tracking..."));

  const agent = new HyperAgent({
    // Uses default OpenAI configuration from environment
  });

  const result = await agent.executeTask(
    "Go to example.com and tell me what you see",
    {
      maxSteps: 2, // Limit steps for testing
      onStep: (step) => {
        console.log(`\nStep ${step.idx}:`);
        if (step.tokenUsage) {
          console.log(`  ✅ Token usage tracked:`);
          console.log(`     Input: ${step.tokenUsage.inputTokens}`);
          console.log(`     Output: ${step.tokenUsage.outputTokens}`);
          console.log(`     Total: ${step.tokenUsage.totalTokens}`);
        } else {
          console.log(`  ❌ No token usage data`);
        }
      },
    }
  );

  await agent.closeAgent();
  console.log(chalk.green("✅ Test completed successfully!"));
})().catch((error) => {
  console.error(chalk.red("❌ Test failed:"), error);
  process.exit(1);
});
