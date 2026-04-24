<h1 align="center">
  Replayable Browser Agent
</h1>

<p align="center">
  <strong>AI drives the browser once. Replay the navigation without AI.</strong>
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

## Why

Most browser-agent work has two parts:

- **Navigation** — many clicks / types / scrolls to reach a target page. Most of the steps, most of the tokens, usually the same every run if the page structure is stable.
- **Extraction** — pull typed data out of whatever is on screen. Must re-run AI each time because the content is live.

`@lightfeed/browser-agent` lets you do navigation once with AI, save it as a plan, and **replay it with zero LLM calls**. Then run a cheap `.extract()` on the result page for the dynamic tail. If the DOM drifts, optional `aiFallback` re-plans only the broken step.

Runs anywhere your browser lives — the same `BrowserAgent` API drives a **local** Chromium for dev, a **serverless** Chromium (AWS Lambda via `@sparticuz/chromium`) for scheduled jobs, or a **remote** CDP endpoint (Brightdata Scraping Browser, any browser farm, or your own). Swap backends by changing one config field; while prompts, plans, and `.extract()` calls stay identical.

## Install

```bash
npm install @lightfeed/browser-agent
```

## Example

Find YC companies in the B2B Legal industry that are hiring now. Navigation (filter the directory) is the expensive-but-stable part; extraction is the live-data part.

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const agent = new BrowserAgent({
  browserProvider: "Local",
  llm: new ChatOpenAI({ model: "gpt-4.1-mini" }),
});

const page = await agent.newPage();

// 1. AI navigation — recordable, replayable.
const nav = await page.ai(
  "Find YC companies in B2B legal industry that are hiring now"
);
await agent.savePlan("yc b2b-legal hiring", nav, "./yc.plan.json");

// 2. AI extraction — typed by a Zod schema, runs AI every call.
const { companies } = await page.extract(
  "All companies currently shown",
  z.object({
    companies: z.array(z.object({
      name: z.string(),
      url: z.string(),
      batch: z.string(),
    })),
  })
);
```

Every subsequent run — navigation is free:

```typescript
await agent.replay("./yc.plan.json", { page });   // zero tokens
const { companies } = await page.extract(/* ... */); // tokens only here
```

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

> The `output` string the model produced while recording is frozen in the plan — replay does **not** regenerate it. If the value of the run is live content or fresh reasoning, keep that in a follow-up `.extract()` / `.ai()`, not inside the recorded plan.

## CLI

Everything above is available without writing code:

```bash
# Record while running
browser-agent-cli run --save-plan ./yc.plan.json \
  -c "Find YC companies in B2B legal industry that are hiring now"

# Replay (zero LLM calls)
browser-agent-cli replay ./yc.plan.json

# Self-heal drifted steps
browser-agent-cli replay ./yc.plan.json --ai-fallback

# Retarget at a different URL
browser-agent-cli replay ./yc.plan.json --url https://staging.example.com/
```

LLM auto-detected from `OPENAI_API_KEY` → `GOOGLE_API_KEY` / `GEMINI_API_KEY` → `ANTHROPIC_API_KEY`. Override the model with `--llm-model` or `OPENAI_MODEL` / `GEMINI_MODEL` / `ANTHROPIC_MODEL`. `replay` only needs an LLM with `--ai-fallback`. Interactive: `ctrl+p` pause, `ctrl+r` resume.

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

## License

MIT. Forked from [HyperAgent](https://github.com/hyperbrowserai/HyperAgent) (b49afe). Serverless browser support by [@sparticuz/chromium](https://github.com/Sparticuz/chromium).
