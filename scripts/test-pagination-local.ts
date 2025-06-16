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
    `Navigate exactly ONE page forward through the main results ONLY if a next page exists and you haven't already navigated on this step.

## Guidelines

1. Check your step history first:
 - If you already navigated forward in recent steps, do not navigate again
 - Only proceed if no recent pagination action was taken

2. Check if a next page exists by looking for:
 - Next button or links
 - Forward arrows
 - Higher page numbers in pagination
 - Load more buttons

3. Navigation rules:
 - Click the next page element exactly once only
 - Do not click back buttons, external links, filters, or sorting
 - Do not navigate if no next page exists
 - Do not navigate if you already moved forward recently

4. Action:
 - Review step history for recent pagination actions
 - If next page exists AND no recent navigation: click it once
 - If already navigated or on last page: do nothing

5. Response format: Return ONLY this JSON with no additional text: {"success": boolean, "hasNextPage": boolean}
- success: true if navigated successfully, false otherwise
- hasNextPage: true if more pages exist after current position
    `,
    { maxSteps: 2 }
  );
  console.log(result);
})();
