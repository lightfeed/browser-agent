import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";
import chalk from "chalk";

dotenv.config();

const agent = new BrowserAgent({
  // a: process.env.OPENAI_API_KEY,
});

(async () => {
  const control = await agent.executeTaskAsync(
    "Go to next page of https://www.loblaws.ca/en/food/bakery/bread/c/28251",
    {
      onStep: (step) => {
        console.log("\n" + chalk.cyan.bold("===== STEP ====="));
        console.dir(step, { depth: null, colors: true });
        console.log(chalk.cyan.bold("===============") + "\n");
      },
    }
  );
  // console.log(chalk.green.bold("\nResult:"));
  // console.log(chalk.white(result.output));
  // await new Promise((resolve) => setTimeout(resolve, 10000));
  // console.log("pausing");
  control.pause();
  // await new Promise((resolve) => setTimeout(resolve, 20000));
  // console.log("resuming");
  control.resume();
})();
