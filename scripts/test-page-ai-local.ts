import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";

dotenv.config();

const agent = new BrowserAgent({
  browserProvider: "Local",
  debug: true,
});

(async () => {
  const page = await agent.newPage();
  await page.goto("https://www.loblaws.ca/en/food/bakery/bread/c/28251?page=3");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    console.log("Network idle timeout, continuing...");
  }
  const result = await page.ai(
    `Navigate exactly ONE page FORWARD through the main results. If you are on the last page, return early and complete the task.

Click only:
- "Next" button or links
- Forward arrows
- HIGER page numbers in pagination
- Load more buttons

DO NOT CLICK:
- "Previous" button
- Backward arrows
- Lower page numbers in pagination.

If you are already on the last page, return early and complete the task.
    `,
    { maxSteps: 3 }
  );
  console.log(result);
})();
