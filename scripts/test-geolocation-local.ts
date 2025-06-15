import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";

dotenv.config();

const agent = new BrowserAgent({
  browserProvider: "Local",
  debug: true,
  localConfig: {
    proxy: {
      host: process.env.PROXY_HOST,
      port: parseInt(process.env.PROXY_PORT!),
      auth: {
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      },
    },
  },
});

(async () => {
  const page = await agent.newPage();
  await page.goto(
    "https://geo.brdtest.com/welcome.txt?product=resi&method=native"
  );
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }
  page.ai("Discard warning and click the button to continue", { maxSteps: 2 });
})();
