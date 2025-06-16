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
    `Navigate exactly ONE page FORWARD through the main results. Please track current page number. Click only:
- "Next" button or links
- Forward arrows
- HIGER page numbers in pagination
- Load more buttons

DO NOT CLICK: "Previous" button, backward arrows or lower page numbers in pagination.
If you are already on the last page, do nothing and return early.
    `,
    { maxSteps: 3 }
  );
  console.log(result);
})();
