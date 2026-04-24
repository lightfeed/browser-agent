import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";

dotenv.config();

/**
 * Demo: drive the browser using the new fine-grained, deterministic
 * primitives exposed on AgentPage. No LLM is configured — every action
 * goes straight through Playwright with no token cost.
 */
(async () => {
  const agent = new BrowserAgent({
    browserProvider: "Local",
    debug: true,
  });

  const page = await agent.newPage();

  await page.navigateTo("https://news.ycombinator.com/");
  await page.waitForLoadState("domcontentloaded");

  // Click the "new" link in the top navigation by CSS selector
  const clickResult = await page.clickElement('a[href="newest"]');
  console.log("click:", clickResult);

  // Scroll down a viewport using the scroll primitive
  const scrollResult = await page.scrollDirection("down");
  console.log("scroll:", scrollResult);

  // Press the End key to jump to the bottom
  const keyResult = await page.keyPress("End");
  console.log("keyPress:", keyResult);

  // Go back
  const backResult = await page.back();
  console.log("back:", backResult);

  await new Promise((r) => setTimeout(r, 3000));
  await agent.closeAgent();
})();
