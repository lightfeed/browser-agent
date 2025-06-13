/**
 * # Anthropic LLM Integration Example
 *
 * This example demonstrates how to configure and use BrowserAgent with Anthropic's
 * Claude language models for web automation tasks.
 *
 * ## What This Example Does
 *
 * The agent performs a web scraping task that:
 * 1. Configures BrowserAgent with Anthropic's Claude 3 Sonnet model
 * 2. Navigates to Hacker News
 * 3. Searches for and extracts information about "Show HN" posts
 *
 * ## Prerequisites
 *
 * 1. Node.js environment
 * 2. Anthropic API key set in your .env file (ANTHROPIC_API_KEY)
 *
 * ## Running the Example
 *
 * ```bash
 * yarn ts-node -r tsconfig-paths/register examples/llms/anthropic.ts
 * ```
 */

import "dotenv/config";
import BrowserAgent from "@hyperbrowser/agent";

import chalk from "chalk";
import { ChatAnthropic } from "@langchain/anthropic";

const TASK =
  "Go to hackernews, and find if there's any SHOW HN post up there. If it is, then tell me the title of the post.";

async function runEval() {
  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-3-7-sonnet-latest",
  });

  const agent = new BrowserAgent({
    llm: llm,
  });

  console.log(`\n${chalk.green("Running agent with Claude Sonnet 3.7")}\n`);

  const result = await agent.executeTask(TASK, {
    debugOnAgentOutput: (agentOutput) => {
      console.log("\n" + chalk.cyan.bold("===== AGENT OUTPUT ====="));
      console.dir(agentOutput, { depth: null, colors: true });
      console.log(chalk.cyan.bold("===============") + "\n");
    },
    onStep: (step) => {
      console.log("\n" + chalk.cyan.bold(`===== STEP ${step.idx} =====`));
      console.dir(step, { depth: null, colors: true });
      console.log(chalk.cyan.bold("===============") + "\n");
    },
  });
  await agent.closeAgent();
  console.log(chalk.green.bold("\nResult:"));
  console.log(chalk.white(result.output));
  return result;
}

(async () => {
  await runEval();
})().catch((error) => {
  console.error(chalk.red("Error:"), error);
  process.exit(1);
});
