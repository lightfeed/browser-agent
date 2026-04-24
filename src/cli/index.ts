#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import { Command } from "commander";
import * as inquirer from "@inquirer/prompts";
import ora from "ora";
import boxen from "boxen";
import chalk from "chalk";
import readline from "readline";
import { zipWith } from "lodash";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { BrowserAgent } from "@/agent";
import { UserInteractionAction } from "@/custom-actions";
import {
  ActionOutput,
  ActionType,
  AgentOutput,
  AgentStep,
  Task,
  TaskOutput,
  TaskStatus,
} from "@/types";
import { BrowserAgentError } from "@/agent/error";

/**
 * Dynamically load a provider SDK and surface a clear, actionable error if
 * it's missing. The provider packages are declared as
 * `optionalDependencies`, so they normally ship with the CLI — but a user
 * who ran `npm install --omit=optional` (or whose install was interrupted)
 * may not have them. In that case, tell them exactly which package to
 * install instead of printing a raw `MODULE_NOT_FOUND` stack.
 */
async function loadProvider<T>(
  packageName: string,
  providerLabel: string,
): Promise<T> {
  try {
    return (await import(packageName)) as T;
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (err as any)?.code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      console.error(
        chalk.red(
          `${providerLabel} provider is not installed.\n` +
            `Install it and retry:\n\n` +
            `  npm install -g ${packageName}\n`,
        ),
      );
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Select an LLM based on environment variables. Providers are checked in
 * priority order: Google, OpenAI, Anthropic. Per-provider model is
 * configurable via `*_MODEL` env vars. Dynamic imports keep unused provider
 * SDKs out of the CLI startup path.
 */
async function createDefaultLlm(): Promise<BaseChatModel | undefined> {
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    const { ChatGoogleGenerativeAI } = await loadProvider<
      typeof import("@langchain/google-genai")
    >("@langchain/google-genai", "Google Gemini");
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      temperature: 0,
    }) as unknown as BaseChatModel;
  }
  if (process.env.OPENAI_API_KEY) {
    const { ChatOpenAI } = await loadProvider<
      typeof import("@langchain/openai")
    >("@langchain/openai", "OpenAI");
    return new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0,
    }) as unknown as BaseChatModel;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { ChatAnthropic } = await loadProvider<
      typeof import("@langchain/anthropic")
    >("@langchain/anthropic", "Anthropic");
    return new ChatAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022",
      temperature: 0,
    }) as unknown as BaseChatModel;
  }
  return undefined;
}

const program = new Command();

let currentSpinner = ora();

program
  .name("browseragent")
  .description("CLI for Browser Agent")
  .version("0.0.1");

program
  .command("run", { isDefault: true })
  .description("Run the interactive CLI")
  .option("-d, --debug", "Enable debug mode")
  .option("-c, --command <task description>", "Command to run")
  .option("-f, --file <file path>", "Path to a file containing a command")
  .option(
    "-s, --save-plan <file path>",
    "Persist the recorded plan to <file path> on task completion for later replay",
  )
  .option(
    "--llm-model <model>",
    "Override the LLM model (applied to whichever provider is auto-detected from env vars)",
  )
  .action(async function () {
    const options = this.opts();
    const debug = (options.debug as boolean) || false;
    let taskDescription = (options.command as string) || undefined;
    const filePath = (options.file as string) || undefined;
    const savePlanPath = (options.savePlan as string) || undefined;
    const llmModelOverride = (options.llmModel as string) || undefined;

    console.log(chalk.blue("BrowserAgent CLI"));
    currentSpinner.info(
      `Pause using ${chalk.bold("ctrl + p")} and resume using ${chalk.bold("ctrl + r")}\n`,
    );

    if (llmModelOverride) {
      if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)
        process.env.GEMINI_MODEL = llmModelOverride;
      else if (process.env.OPENAI_API_KEY)
        process.env.OPENAI_MODEL = llmModelOverride;
      else if (process.env.ANTHROPIC_API_KEY)
        process.env.ANTHROPIC_MODEL = llmModelOverride;
    }

    const llm = await createDefaultLlm();
    if (!llm) {
      console.error(
        chalk.red(
          "No LLM provider configured. Set one of GOOGLE_API_KEY (or GEMINI_API_KEY), OPENAI_API_KEY, or ANTHROPIC_API_KEY.",
        ),
      );
      process.exit(1);
    }

    try {
      const agent = new BrowserAgent({
        llm,
        debug: debug,
        browserProvider: "Local",
        customActions: [
          UserInteractionAction(
            async ({ message, kind, choices }): Promise<ActionOutput> => {
              const currentText = currentSpinner.text;
              try {
                currentSpinner.stop();
                currentSpinner.clear();
                if (kind === "text_input") {
                  const response = await inquirer.input({
                    message,
                    required: true,
                  });
                  return {
                    success: true,
                    message: `User responded with the text: "${response}"`,
                  };
                } else if (kind === "confirm") {
                  const response = await inquirer.confirm({
                    message,
                  });
                  return {
                    success: true,
                    message: `User responded with "${response}"`,
                  };
                } else if (kind === "password") {
                  console.warn(
                    chalk.red(
                      "Providing passwords to LLMs can be dangerous. Passwords are passed in plain-text to the LLM and can be read by other people.",
                    ),
                  );
                  const response = await inquirer.password({
                    message,
                  });
                  return {
                    success: true,
                    message: `User responded with password: ${response}`,
                  };
                } else {
                  if (!choices) {
                    return {
                      success: false,
                      message:
                        "For choices kind of user interaction, an array of choices is required.",
                    };
                  } else {
                    const response = await inquirer.select({
                      message,
                      choices: choices.map((option) => ({
                        value: option,
                        name: option,
                      })),
                    });
                    return {
                      success: true,
                      message: `User selected the choice: ${response}`,
                    };
                  }
                }
              } finally {
                currentSpinner.start(currentText);
              }
            },
          ),
        ],
      });

      let task: Task;

      readline.emitKeypressEvents(process.stdin);

      process.stdin.on("keypress", async (ch, key) => {
        if (key && key.ctrl && key.name == "p") {
          if (currentSpinner.isSpinning) {
            currentSpinner.stopAndPersist({ symbol: "⏸" });
          }
          currentSpinner.start(
            chalk.blue(
              "BrowserAgent will pause after completing this operation. Press Ctrl+r again to resume.",
            ),
          );
          currentSpinner.stopAndPersist({ symbol: "⏸" });
          currentSpinner = ora();

          if (task.getStatus() == TaskStatus.RUNNING) {
            task.pause();
          }
        } else if (key && key.ctrl && key.name == "r") {
          if (task.getStatus() == TaskStatus.PAUSED) {
            currentSpinner.start(chalk.blue("BrowserAgent will resume"));
            currentSpinner.stopAndPersist({ symbol: "⏵" });
            currentSpinner = ora();

            task.resume();
          }
        } else if (key && key.ctrl && key.name == "c") {
          if (currentSpinner.isSpinning) {
            currentSpinner.stopAndPersist();
          }
          console.log("\nShutting down BrowserAgent");
          try {
            await agent.closeAgent();
            process.exit(0);
          } catch (err) {
            console.error("Error during shutdown:", err);
            process.exit(1);
          }
        }
      });

      process.stdin.setRawMode(true);

      const onStep = (params: AgentStep) => {
        const actionsList = zipWith(
          params.actionOutputs,
          params.agentOutput.actions,
          (output, action) => ({
            output,
            action,
          }),
        );

        const actions = actionsList
          .map((action, index, array) =>
            index < array.length - 1
              ? `  ├── [${action.output.success ? chalk.yellow(action.action.type) : chalk.red(action.action.type)}] ${action.output.success ? agent.pprintAction(action.action as ActionType) : chalk.red(action.output.message)}`
              : `  └── [${action.output.success ? chalk.yellow(action.action.type) : chalk.red(action.action.type)}] ${action.output.success ? agent.pprintAction(action.action as ActionType) : chalk.red(action.output.message)}`,
          )
          .join("\n");

        currentSpinner.succeed(
          `[${chalk.yellow("task")}]: ${params.agentOutput.nextGoal}\n${actions}`,
        );
        currentSpinner = ora();
        process.stdin.setRawMode(true);
        process.stdin.resume();
      };

      const debugAgentOutput = (params: AgentOutput) => {
        const actions = params.actions.map((action, index, array) =>
          index < array.length - 1
            ? `  ├── [${chalk.yellow(action.type)}] ${agent.pprintAction(action as ActionType)}`
            : `  └── [${chalk.yellow(action.type)}] ${agent.pprintAction(action as ActionType)}`,
        );
        currentSpinner.start(
          `[${chalk.yellow("task")}]: ${params.nextGoal}\n${actions.join("\n")}`,
        );
        process.stdin.setRawMode(true);
        process.stdin.resume();
      };

      const onComplete = async (params: TaskOutput) => {
        console.log(
          boxen(params.output || "No Response", {
            title: chalk.yellow("BrowserAgent Response"),
            titleAlignment: "center",
            float: "center",
            padding: 1,
            margin: { top: 2, left: 0, right: 0, bottom: 0 },
          }),
        );
        if (savePlanPath && taskDescription) {
          try {
            await agent.savePlan(taskDescription, params, savePlanPath);
            console.log(chalk.green(`\nSaved plan to ${savePlanPath}`));
          } catch (err) {
            console.log(
              chalk.red(
                `\nFailed to save plan: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
          }
        }
        console.log("\n");
        const continueTask = await inquirer.select({
          message: "Would you like to continue ",
          choices: [
            { name: "Yes", value: true },
            { name: "No", value: false },
          ],
        });
        if (continueTask) {
          const taskDescription = await inquirer.input({
            message: "What should BrowserAgent do next for you?",
            required: true,
          });

          process.stdin.setRawMode(true);
          process.stdin.resume();

          task = await agent.executeTaskAsync(taskDescription, {
            onStep: onStep,
            debugOnAgentOutput: debugAgentOutput,
            onComplete: onComplete,
          });
          task.emitter.addListener("error", (error) => {
            task.cancel();
            throw error;
          });
        } else {
          process.exit(0);
        }
      };
      if (!taskDescription) {
        if (filePath) {
          taskDescription = (await fs.promises.readFile(filePath)).toString();
        } else {
          taskDescription = await inquirer.input({
            message: "What should BrowserAgent do for you today?",
            required: true,
          });
        }
      }

      task = await agent.executeTaskAsync(taskDescription, {
        onStep: onStep,
        onComplete: onComplete,
        debugOnAgentOutput: debugAgentOutput,
      });
      task.emitter.addListener("error", (error) => {
        task.cancel();
        throw error;
      });
    } catch (err) {
      if (err instanceof BrowserAgentError || err instanceof Error) {
        console.log(chalk.red(err.message));
        if (debug) {
          console.trace(err);
        }
      } else {
        console.log(chalk.red(err));
        if (debug) {
          console.trace(err);
        }
      }
    }
  });

program
  .command("replay")
  .description("Replay a saved plan without calling the LLM")
  .argument(
    "<file>",
    "Path to a plan JSON file previously saved with --save-plan",
  )
  .option("-d, --debug", "Enable debug mode")
  .option(
    "--ai-fallback",
    "Fall back to .ai() for individual steps that fail (requires an LLM to be configured)",
  )
  .option(
    "-u, --url <url>",
    "Starting URL to navigate to before running the plan (overrides the plan's recorded startingUrl)",
  )
  .action(async function (file: string) {
    const options = this.opts();
    const debug = (options.debug as boolean) || false;
    const aiFallback = (options.aiFallback as boolean) || false;
    const startingUrl = (options.url as string) || undefined;

    console.log(chalk.blue("BrowserAgent Replay"));
    const spinner = ora();

    try {
      const llm = aiFallback ? await createDefaultLlm() : undefined;
      if (aiFallback && !llm) {
        console.error(
          chalk.red(
            "--ai-fallback requires an LLM. Set one of GOOGLE_API_KEY (or GEMINI_API_KEY), OPENAI_API_KEY, or ANTHROPIC_API_KEY.",
          ),
        );
        process.exit(1);
      }

      const agent = new BrowserAgent({
        llm,
        debug,
        browserProvider: "Local",
      });

      const page = await agent.newPage();
      spinner.start(`Replaying plan from ${file}`);

      await agent.replay(file, {
        page,
        aiFallback,
        startingUrl,
        onStep: (action, output) => {
          const label = agent.pprintAction({
            type: action.type,
            params: action.params as object,
          });
          spinner.succeed(
            `[${chalk.yellow(action.type)}] ${label || output.message}`,
          );
          spinner.start("Continuing replay...");
        },
        onError: (action, err) => {
          spinner.fail(`[${chalk.red(action.type)}] ${err.message}`);
          return "abort";
        },
      });

      spinner.succeed(chalk.green("Replay complete."));

      const shouldExit = await inquirer.confirm({
        message: "Close browser and exit?",
        default: true,
      });
      if (shouldExit) {
        await agent.closeAgent();
        process.exit(0);
      }
    } catch (err) {
      spinner.stop();
      if (err instanceof BrowserAgentError || err instanceof Error) {
        console.log(chalk.red(err.message));
        if (debug) {
          console.trace(err);
        }
      } else {
        console.log(chalk.red(String(err)));
      }
      process.exit(1);
    }
  });

program.parse();
