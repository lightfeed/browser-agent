import { z } from "zod";
import { BrowserAgent } from "../src/agent";
import dotenv from "dotenv";

dotenv.config();

const agent = new BrowserAgent();

(async () => {
  const page = await agent.newPage();
  await page.goto("https://flights.google.com", { waitUntil: "load" });
  const res = await page.extract("What are the preselected options?");
  console.log(res);
  const res2 = await page.extract(
    "What are the preselected options?",
    z.object({
      options: z.array(z.string()),
    })
  );
  console.log(res2);
})();
