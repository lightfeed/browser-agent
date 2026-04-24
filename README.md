<h1 align="center">
  Replayable Browser Agent
</h1>

<p align="center">
  <strong>TypeScript browser agent library. AI drives the browser once — replay the navigation with zero LLM tokens.</strong>
</p>

<div align="center">
  <a href="https://www.npmjs.com/package/@lightfeed/browser-agent">
    <img src="https://img.shields.io/npm/v/@lightfeed/browser-agent?logo=npm" alt="npm" /></a>
  <a href="https://github.com/lightfeed/browser-agent/actions/workflows/test.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/lightfeed/browser-agent/test.yml?branch=main"
          alt="Test status (main branch)"></a>
  <a href="https://github.com/lightfeed/browser-agent/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/lightfeed/browser-agent" alt="License" /></a>
</div>

## Overview
`@lightfeed/browser-agent` is a TypeScript browser agent library built for cutting LLM token use on every rerun.

Most browser-agent work has two parts:

- **Navigation** — many clicks / types / scrolls to reach a target page. Most of the steps, most of the tokens, usually the same every run if the page structure is stable. Today's agents pay for these tokens *every single time*.
- **Extraction** — pull typed data out of whatever is on screen. Must re-run AI each time because the content is live.

**This library lets you run navigation once with AI, save it as a plan, and replay it with zero LLM calls** — no screenshots, no DOM map, no tokens. Then run a cheap `.extract()` on the result page for the dynamic tail. If the DOM drifts, optional `aiFallback` re-plans **only the broken step**, so you still pay tokens for a fraction of the flow instead of all of it.

**Runs anywhere your browser lives** — the same `BrowserAgent` API drives a **local** Chromium for dev, a **serverless** Chromium (AWS Lambda via `@sparticuz/chromium`) for scheduled jobs, or a **remote** CDP endpoint (Brightdata Scraping Browser, any browser farm, or your own). Swap backends by changing one config field; prompts, plans, and `.extract()` calls stay identical.

## Install

```bash
npm install @lightfeed/browser-agent
```

## Example

Go to the Hacker News Show section, click through to the next page, and grab the top 3 posts. Navigation (open Show, paginate) is the expensive-but-stable part; extraction is the live-data part.

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

const agent = new BrowserAgent({
  browserProvider: "Local",
  llm: new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" }),
});

const page = await agent.newPage();

// 1. AI navigation — recordable, replayable.
const nav = await page.ai(
  "Go to Hacker News show section, go to next page"
);
await agent.savePlan("hn show page 2", nav, "./hn.plan.json");

// 2. AI extraction — typed by a Zod schema, runs AI every call.
const { articles } = await page.extract(
  "The top 3 articles on this page",
  z.object({
    articles: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
          points: z.number(),
          commentsUrl: z.string(),
        })
      )
      .max(3),
  })
);
```

Every subsequent run — navigation is free:

```typescript
await agent.replay("./hn.plan.json", { page });   // zero tokens
const { articles } = await page.extract(/* ... */); // tokens only here
```

## CLI

Everything above is available without writing code:

```bash
# Record while running
browser-agent-cli run --save-plan ./hn.plan.json \
  -c "Go to Hacker News show section, go to next page and find top 3 articles"

# Replay: deterministic navigation (no LLM), then one fresh AI pass on the
# result page to produce an up-to-date final response. The navigation part
# is free; only the final pass spends tokens.
browser-agent-cli replay ./hn.plan.json

# Pure replay — skip the final AI pass and just get the browser onto the
# result page (zero LLM calls end-to-end).
browser-agent-cli replay ./hn.plan.json --no-ai-finish

# Use a different finishing task (e.g. ask for a custom summary of the
# current page instead of re-running the recorded task).
browser-agent-cli replay ./hn.plan.json \
  --finish-task "Return the titles of the first 3 posts as a bullet list"

# Self-heal drifted steps during replay (independent of the finish pass).
browser-agent-cli replay ./hn.plan.json --ai-fallback
```
<img width="836" height="658" alt="Screenshot 2026-04-24 at 1 54 50 AM" src="https://github.com/user-attachments/assets/d7c159d6-e5dd-4427-95ab-c7c4ec7ff522" />


LLM auto-detected from `GOOGLE_API_KEY` / `GEMINI_API_KEY` → `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`. Override the model with `--llm-model` or `GEMINI_MODEL` / `OPENAI_MODEL` / `ANTHROPIC_MODEL`. `replay` only needs an LLM with `--ai-fallback`. Interactive: `ctrl+p` pause, `ctrl+r` resume.

## Browser providers

The same `BrowserAgent` API works against three backends.

<details>
<summary><strong>Local</strong> — your machine, for dev and prototyping</summary>

```typescript
const agent = new BrowserAgent({ browserProvider: "Local" });
```
</details>

<details>
<summary><strong>Remote</strong> — any CDP-over-WebSocket endpoint (Brightdata Scraping Browser, browser farms, your own)</summary>

```typescript
const agent = new BrowserAgent({
  browserProvider: "Remote",
  remoteConfig: {
    browserWSEndpoint: "ws://your-remote-browser:9222/devtools/browser/ws",
  },
});
```
</details>

<details>
<summary><strong>Serverless</strong> — AWS Lambda etc. via <code>@sparticuz/chromium</code></summary>

> **Version pinning:** This project uses Playwright, which ships with a specific version of Chromium. You need a matching `@sparticuz/chromium`. We're on [Playwright 1.49](https://playwright.dev/docs/release-notes#version-149) (Chromium 133), so install `@sparticuz/chromium@133`. For AWS Lambda, ARM64 is preferred; you also need the `canvas` native dependencies — see [`lambda-layer-build.sh`](./lambda-layer-build.sh).

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";
import chromium from "@sparticuz/chromium";

const agent = new BrowserAgent({
  browserProvider: "Serverless",
  serverlessConfig: {
    executablePath: await chromium.executablePath(),
    options: { args: chromium.args },
  },
});
```
</details>

## `page.ai` vs `agent.executeTask` vs `agent.executeTaskAsync`

All three drive the browser with AI, return the same `TaskOutput`, and can be recorded + replayed.

| API                            | Use when                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.ai(task)`                | You already have a page and want to mix Playwright calls (`page.goto`, `page.clickElement`) with AI steps on the same tab. Resolves when done.                 |
| `agent.executeTask(task)`      | "Here's a goal, figure it out." The agent owns the page; include URLs in the prompt and it navigates itself. Resolves when done.                               |
| `agent.executeTaskAsync(task)` | Same as `executeTask` but returns a `Task` control handle immediately — `task.pause()`, `task.resume()`, `task.cancel()`, and per-step event callbacks. For long-running flows, CLIs, or anything a user can interrupt. |

## Record & replay

- `agent.savePlan(task, result, path)` writes a JSON plan with the action sequence and a stable `xpath` + `cssPath` for each clicked / typed element.
- `agent.replay(path, { page })` re-runs those actions with no LLM calls, no screenshots, no DOM map.
- `aiFallback: true` re-plans **only** a drifted step with the LLM; the rest stays free.
- `startingUrl` (option, or `--url` on the CLI) retargets a plan at a different URL — useful for staging / preview deploys / different queries.
- Plans are human-readable and hand-editable (tweak an `inputText` value, reorder or delete steps).

> The `output` string the model produced while recording is frozen in the plan — the programmatic `agent.replay()` does **not** regenerate it. The CLI's `replay` command, by default, runs one fresh AI pass (`page.ai(plan.task, { maxSteps: 3 })`) on the result page after navigation so every CLI run ends with an up-to-date response; pass `--no-ai-finish` to get pure token-free replay and fall back to the recorded output. If you're wiring this up programmatically, run your own `.extract()` / `.ai()` on the page after `agent.replay()` instead of relying on the recorded `output`.

## License

MIT. Forked from [HyperAgent](https://github.com/hyperbrowserai/HyperAgent) (b49afe). Serverless browser support by [@sparticuz/chromium](https://github.com/Sparticuz/chromium).
