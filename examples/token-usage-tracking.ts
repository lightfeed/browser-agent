/**
 * # Token Usage Tracking Example
 *
 * This example demonstrates how to track token usage for each step
 * when using BrowserAgent with LangChain.js callbacks.
 *
 * ## What This Example Does
 *
 * The agent performs a simple task while tracking:
 * 1. Input tokens used for each step
 * 2. Output tokens generated for each step
 * 3. Total tokens consumed for each step
 *
 * ## Prerequisites
 *
 * 1. Node.js environment
 * 2. OpenAI API key set in your .env file (OPENAI_API_KEY)
 *
 * ## Running the Example
 *
 * ```bash
 * yarn ts-node -r tsconfig-paths/register examples/token-usage-tracking.ts
 * ```
 */

import "dotenv/config";
import { BrowserAgent } from "../src/agent";
import { ChatOpenAI } from "@langchain/openai";
import chalk from "chalk";

async function runTokenTrackingExample() {
  console.log(chalk.cyan.bold("\n===== Token Usage Tracking Example ====="));

  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini", // Using mini model for cost efficiency
  });

  const agent = new BrowserAgent({
    llm: llm,
    debug: true,
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;

  const result = await agent.executeTask(
    "Go to example.com and tell me what the main heading says",
    {
      onStep: (step) => {
        console.log("\n" + chalk.cyan.bold(`===== STEP ${step.idx} =====`));

        // Display token usage information
        if (step.tokenUsage) {
          console.log(chalk.yellow.bold("Token Usage:"));
          console.log(
            `  Input Tokens: ${chalk.green(step.tokenUsage.inputTokens)}`
          );
          console.log(
            `  Output Tokens: ${chalk.green(step.tokenUsage.outputTokens)}`
          );
          console.log(
            `  Total Tokens: ${chalk.green(step.tokenUsage.totalTokens)}`
          );

          // Accumulate totals
          totalInputTokens += step.tokenUsage.inputTokens;
          totalOutputTokens += step.tokenUsage.outputTokens;
          totalTokens += step.tokenUsage.totalTokens;
        } else {
          console.log(chalk.red("No token usage data available for this step"));
        }

        // Display agent output
        console.log(chalk.blue.bold("Agent Output:"));
        console.log(`  Thoughts: ${step.agentOutput.thoughts}`);
        console.log(`  Next Goal: ${step.agentOutput.nextGoal}`);
        console.log(`  Actions: ${step.agentOutput.actions.length} action(s)`);

        console.log(chalk.cyan.bold("===============") + "\n");
      },
      debugOnAgentOutput: (agentOutput) => {
        // Optional: Log detailed agent output for debugging
        if (process.env.DEBUG_VERBOSE) {
          console.log(
            "\n" + chalk.magenta.bold("===== DETAILED AGENT OUTPUT =====")
          );
          console.dir(agentOutput, { depth: null, colors: true });
          console.log(chalk.magenta.bold("===============") + "\n");
        }
      },
    }
  );

  await agent.closeAgent();

  // Display final results
  console.log(chalk.green.bold("\n===== FINAL RESULTS ====="));
  console.log(chalk.white("Task Result:"));
  console.log(chalk.white(result.output));

  console.log(chalk.yellow.bold("\nTotal Token Usage Summary:"));
  console.log(`  Total Input Tokens: ${chalk.green(totalInputTokens)}`);
  console.log(`  Total Output Tokens: ${chalk.green(totalOutputTokens)}`);
  console.log(`  Total Tokens Used: ${chalk.green(totalTokens)}`);

  // Calculate estimated cost (approximate rates for GPT-4o-mini)
  const inputCostPer1M = 0.15; // $0.15 per 1M input tokens
  const outputCostPer1M = 0.6; // $0.60 per 1M output tokens

  const inputCost = (totalInputTokens / 1000000) * inputCostPer1M;
  const outputCost = (totalOutputTokens / 1000000) * outputCostPer1M;
  const totalCost = inputCost + outputCost;

  console.log(chalk.yellow.bold("\nEstimated Cost (GPT-4o-mini rates):"));
  console.log(`  Input Cost: ${chalk.green(`$${inputCost.toFixed(6)}`)}`);
  console.log(`  Output Cost: ${chalk.green(`$${outputCost.toFixed(6)}`)}`);
  console.log(`  Total Cost: ${chalk.green(`$${totalCost.toFixed(6)}`)}`);

  return result;
}

(async () => {
  await runTokenTrackingExample();
})().catch((error) => {
  console.error(chalk.red("Error:"), error);
  process.exit(1);
});
