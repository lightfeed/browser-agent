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
  // White Rock, BC
  const lat = 49.019917;
  const lon = -122.802612;
  const client = await page.context().newCDPSession(page);
  await client.send("Proxy.setLocation", {
    lat,
    lon,
    distance: 50,
    strict: true,
  });
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
