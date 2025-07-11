import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";

dotenv.config();

const agent = new BrowserAgent({
  browserProvider: "Remote",
  remoteConfig: {
    wsEndpoint: process.env.REMOTE_BROWSER_WS_ENDPOINT,
  },
  debug: true,
});

(async () => {
  const page = await agent.newPage();
  await page.goto("https://www.loblaws.ca/en/food/bakery/bread/c/28251");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }
  page.ai("Find pagination links and go to the next page", { maxSteps: 2 });
})();
