<h1 align="center">
  Serverless Browser Agent ⚡️
</h1>

<p align="center">
  <strong>AI-driven browser automation with deterministic, zero-token replay for repeatable workflows</strong>
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

`@lightfeed/browser-agent` lets an LLM drive a real browser to complete tasks from natural-language prompts — and, uniquely, lets you **record the navigation as a plan and replay it with zero LLM calls**. Use AI to figure out _how_ to reach a page once, then replay the deterministic click/type/scroll sequence forever after. Pair it with a cheap follow-up `.extract()` or `.ai()` when you need fresh AI output on each run, and rely on optional self-healing AI fallback when a recorded selector drifts.

## Highlights

- **Record & replay for zero-token navigation** — run `.ai()` once, save the resolved action sequence as JSON, replay the clicks/types/scrolls with no model calls, no screenshots, no DOM map. Then run a cheap `.extract()` / `.ai()` for the dynamic tail if you need fresh AI output.
- **Self-healing replay** — `aiFallback: true` transparently re-plans only the step that drifted, so small DOM changes don't nuke an entire workflow.
- **Fine-grained deterministic primitives** — `page.clickElement`, `inputText`, `scrollDirection`, `keyPress`, `navigateTo`, etc., alongside `page.ai` / `page.extract`.
- **AI-first when you need it** — `.ai()` plans actions from a screenshot + interactive-element map; `.extract()` returns structured data typed by a Zod schema.
- **Runs anywhere a browser does** — local Chrome, any remote CDP endpoint, or serverless (AWS Lambda via `@sparticuz/chromium`).
- **Batteries-included CLI** — `browser-agent-cli` runs tasks, records plans, and replays them without writing a single line of code; auto-detects your LLM from env vars.

## Installation

```bash
npm install @lightfeed/browser-agent
```

## Quick Start

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const agent = new BrowserAgent({
  browserProvider: "Local",
  llm: new ChatOpenAI({ model: "gpt-4.1-mini" }),
});

const page = await agent.newPage();
await page.goto("https://news.ycombinator.com/");

// Let the LLM drive the page to complete a task.
await page.ai("Click the 'new' link to go to the newest stories page");

// Or extract structured data using a Zod schema.
const { posts } = await page.extract(
  "The top 3 stories on this page",
  z.object({
    posts: z.array(z.object({ title: z.string(), url: z.string() })),
  })
);
```

> **Does `page.ai` require `page.goto` first?** No. The agent has a built-in `goToUrl` action, so if your prompt contains a URL (`"Go to https://... and do X"`) it will navigate itself. The typical patterns are either (1) `page.goto(url)` then a `page.ai(task)` about the current page, or (2) include the URL inside the prompt. Starting on `about:blank` with no URL anywhere will make the agent flail.

## CLI

A ready-to-use CLI ships with the package — no code required. Install globally (or use `npx`) and you can drive the agent straight from your shell, including recording and replaying plans.

```bash
# One-off task (will open a local Chrome window)
browser-agent-cli run -c "Go to https://news.ycombinator.com and summarise the top 3 stories"

# Read the task from a file
browser-agent-cli run -f ./task.txt

# Record while running, save as a reusable plan
browser-agent-cli run --save-plan ./hn.plan.json \
  -c "Click the 'new' link to go to the newest stories page"

# Replay a plan with zero LLM calls
browser-agent-cli replay ./hn.plan.json

# Replay with self-healing AI fallback only for drifted steps
browser-agent-cli replay ./hn.plan.json --ai-fallback

# Override the starting URL (useful for older plans or staging hosts)
browser-agent-cli replay ./hn.plan.json --url https://news.ycombinator.com/

# Enable verbose debug output
browser-agent-cli run -d -c "..."
```

**LLM auto-detection.** The CLI picks a provider from env vars in this order: `OPENAI_API_KEY` → `GOOGLE_API_KEY` / `GEMINI_API_KEY` → `ANTHROPIC_API_KEY`. Per-provider model defaults are `gpt-4.1-mini`, `gemini-2.5-flash`, `claude-3-5-sonnet-20241022`; override with `--llm-model <name>` or the `OPENAI_MODEL` / `GEMINI_MODEL` / `ANTHROPIC_MODEL` env vars. `replay` only needs an LLM when `--ai-fallback` is set.

**Interactive controls.** While a task is running:
- `ctrl + p` — pause
- `ctrl + r` — resume

**Key flags**

| Command  | Flag                       | Description                                                                          |
| -------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `run`    | `-c, --command <string>`   | Task description inline.                                                             |
| `run`    | `-f, --file <path>`        | Read task description from a file.                                                   |
| `run`    | `-s, --save-plan <path>`   | Persist the recorded plan on completion for later replay.                            |
| `run`    | `--llm-model <model>`      | Override the auto-detected LLM model.                                                |
| `run`    | `-d, --debug`              | Enable verbose debug output (screenshots, DOM dumps per step).                       |
| `replay` | `--ai-fallback`            | Re-plan a single step via `.ai()` when its selector no longer matches.               |
| `replay` | `-u, --url <url>`          | Override the plan's recorded `startingUrl`.                                          |
| `replay` | `-d, --debug`              | Enable verbose debug output.                                                         |

## Record and Replay (the main differentiator)

Every `.ai()` call costs tokens because the model plans actions off a screenshot plus an interactive-element map. For **repeatable browser navigation** you can record the plan once and replay it for free.

> **What replay does:** re-executes the recorded browser **actions** (click, type, scroll, navigate, select, keypress) against today's page, using the stable selectors captured at record time.
>
> **What replay does NOT do:** re-run the LLM. Any content the model _generated_ during recording — a summary, a decision, a reasoned answer — is frozen as the plan's `output` and will not be regenerated. If your task's value is AI reasoning over live content, replay is only useful for the navigation prefix.

**Use replay when** the value is getting the browser into a particular state — login flows, form fills, multi-step navigation to a results page, scheduled/CI automations.

**Use the "replay then extract" pattern when** the value is fresh data or AI reasoning on each run:

```typescript
// Step 1: replay navigates to the right page for free (deterministic, no LLM).
await agent.replay("./hn-open-newest.plan.json", { page });

// Step 2: run a normal extract / ai call for just the dynamic tail.
//         You pay tokens only for this small, content-dependent step.
const { stories } = await page.extract(
  "The top 3 stories on this page",
  z.object({
    stories: z.array(z.object({ title: z.string(), url: z.string() })),
  })
);
```

This pattern gives you the best of both worlds: cheap, deterministic navigation, plus fresh AI output. `aiFallback` is orthogonal — it covers the case where a *recorded action* (not the extraction) needs re-planning because a selector drifted.

**Don't use replay when** the entire task is one-off / exploratory, or when the decision logic itself needs to adapt each run (e.g. "pick the cheapest flight" — you can replay the path to the results page, but the pick must stay AI-driven via a follow-up `.ai()` / `.extract()`).

### Record a plan

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";
import { ChatOpenAI } from "@langchain/openai";

const agent = new BrowserAgent({
  browserProvider: "Local",
  llm: new ChatOpenAI({ model: "gpt-4.1-mini" }),
});

const page = await agent.newPage();
await page.goto("https://news.ycombinator.com/");

const task = "Click the 'new' link to go to the newest stories page";
const result = await page.ai(task, { maxSteps: 5 });

await agent.savePlan(task, result, "./hn-newest.plan.json");
```

The saved file contains the action sequence plus a stable `xpath` / `cssPath` for every clicked / typed element, captured at record time. Screenshots and DOM dumps are **not** included. The URL the page was on when the task started is recorded as `startingUrl` so replay can navigate there automatically.

### Replay without an LLM

```typescript
// No `llm` configured — replay does not need one.
const agent = new BrowserAgent({ browserProvider: "Local" });
const page = await agent.newPage();

// Replay navigates to the plan's recorded startingUrl on its own.
await agent.replay("./hn-newest.plan.json", {
  page,
  onStep: (action, output) =>
    console.log(`[${action.type}] ${output.message}`),
});
```

### Self-healing with `aiFallback`

Pages drift. When a recorded selector no longer matches (element removed, rewrapped, reindexed), you can let the agent re-plan **just that step** using the LLM, then keep running the rest of the plan deterministically.

```typescript
const agent = new BrowserAgent({
  browserProvider: "Local",
  llm: new ChatOpenAI({ model: "gpt-4.1-mini" }),
});

await agent.replay("./hn-newest.plan.json", {
  page,
  aiFallback: true, // use .ai() only on a failed step; other steps stay zero-token
});
```

You still pay tokens only for the drifted step — the rest of the plan remains free.

### All `replay` options

| Option           | Type                                                         | Default | Description                                                                                      |
| ---------------- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `page`           | `Page`                                                       | new     | Page to replay on. If omitted, a fresh one is created.                                           |
| `aiFallback`     | `boolean`                                                    | `false` | On step failure, call `.ai()` for just that step. Requires an `llm` on the agent.                |
| `aiFallbackTask` | `(action) => string`                                         | auto    | Customise the prompt used by the fallback.                                                       |
| `onStep`         | `(action, output) => void \| Promise<void>`                  | —       | Observe each replayed action.                                                                    |
| `onError`        | `(action, err) => "abort" \| "skip" \| Promise<…>`           | `abort` | Custom failure handling.                                                                         |
| `startingUrl`    | `string`                                                     | —       | Override the plan's recorded `startingUrl`. Useful for older plans or to run on a staging host.  |
| `stepTimeoutMs`  | `number`                                                     | `10000` | Per-step visibility wait.                                                                        |
| `variables`      | `Record<string, AgentVariable>`                              | —       | Variable overrides for parameterised plans.                                                      |

### From the CLI

Everything above is available without writing code — see the [CLI section](#cli) for `run --save-plan` and `replay` usage.

### Plan JSON format

Plans are human-readable and safe to hand-edit — swap `startingUrl` to retarget a different host, tweak an `inputText` value, reorder steps, delete an unwanted step.

```json
{
  "version": 1,
  "task": "Click the 'new' link to go to the newest stories page",
  "createdAt": "2026-04-23T08:20:33.423Z",
  "startingUrl": "https://news.ycombinator.com/",
  "output": "Navigated to /newest",
  "steps": [
    {
      "type": "clickElement",
      "params": { "index": 8 },
      "resolvedLocator": {
        "xpath": "/html/body/center/table[@id=\"hnmain\"]/tbody/tr[1]/td/table/tbody/tr/td[2]/span/a[5]",
        "cssPath": "html > body > center > #hnmain > tbody > tr:nth-of-type(1) > td > table > tbody > tr > td:nth-of-type(2) > span.pagetop > a:nth-of-type(5)",
        "isUnderShadowRoot": false
      }
    }
  ]
}
```

| Field              | Notes                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`          | Schema version for future migrations. Only `1` exists today.                                                                                              |
| `task`             | The original natural-language task. Used for the `aiFallback` prompt unless `aiFallbackTask` is provided.                                                 |
| `createdAt`        | ISO-8601 timestamp when the plan was saved.                                                                                                               |
| `startingUrl`      | URL the recording page was on when the task started. Replay navigates here automatically unless the first step is itself a `goToUrl`.                     |
| `output`           | The LLM's final answer from the recording run, if any. Informational only; not used at replay time.                                                       |
| `steps[]`          | Flat list of action-level steps — a single recorded `.ai()` call can produce multiple steps.                                                              |
| `steps[].type`     | Action name: `goToUrl`, `clickElement`, `inputText`, `selectOptionByText`, `scrollDirection`, `keyPress`, `back`, `forward`, `refresh`, custom action, …  |
| `steps[].params`   | Action-specific params. For recorded element-targeting actions this includes `index` — meaningful only at record time; replay uses `resolvedLocator`.     |
| `resolvedLocator`  | Captured at record time from the DOM map. Contains `xpath`, `cssPath`, and `isUnderShadowRoot`. This is what makes replay survive DOM-index churn.        |

## Fine-grained Actions

In addition to `.ai()`, `.aiAsync()`, and `.extract()`, every `AgentPage` exposes the underlying actions as **deterministic primitives**. These drive Playwright directly with the same robustness wrappers the agent uses internally (scroll-into-view, stability / enabled checks, shadow-DOM handling) but skip the LLM entirely — so they are **free** in terms of tokens.

```typescript
const page = await agent.newPage();

await page.navigateTo("https://example.com");
await page.clickElement('a[href="/about"]');              // CSS selector
await page.clickElement('xpath=//button[@id="submit"]');  // xpath
await page.inputText("#email", "hello@example.com");
await page.selectOptionByText('select[name="country"]', "Canada");
await page.scrollDirection("down");
await page.keyPress("Enter");
await page.back();
await page.forward();
await page.refresh();
```

Targets accept either a Playwright selector string (CSS or `xpath=...`) or a `ResolvedLocator` copied out of a saved plan — useful when hand-assembling a deterministic workflow.

## `page.ai` vs `agent.executeTask`

Two programmatic entry points for AI-driven tasks:

| API                        | When to use                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `page.ai(task, params?)`   | You already have a page and want to mix Playwright calls (`page.goto`, `page.clickElement`) with AI steps on the current tab. |
| `agent.executeTask(task)`  | "Here's a goal, figure it out." The agent owns the page, opens URLs via its `goToUrl` action, and returns a `TaskOutput`.     |

Both return the same `TaskOutput` shape and both can be recorded / replayed via `agent.savePlan` / `agent.replay`. There's also `page.aiAsync` / `agent.executeTaskAsync` for long-running tasks you want to pause, resume, or cancel.

```typescript
// agent-owned flow — no explicit page.goto
const result = await agent.executeTask(
  "Go to https://news.ycombinator.com and open the newest stories page"
);
await agent.savePlan("open HN newest", result, "./hn-newest.plan.json");
```

## Browser providers

The same `BrowserAgent` API works against three backends. Pick the one that matches your runtime.

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

> **Version pinning:** This project uses Playwright, which ships with a specific version of Chromium. You need a matching `@sparticuz/chromium`. We're on [Playwright 1.49](https://playwright.dev/docs/release-notes#version-149) (Chromium 133), so install `@sparticuz/chromium@133`.
>
> For AWS Lambda, ARM64 is preferred. You also need the `canvas` native dependencies — see [`lambda-layer-build.sh`](./lambda-layer-build.sh).

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";
import chromium from "@sparticuz/chromium";
import { AxiosProxyConfig } from "axios";

const agent = new BrowserAgent({
  browserProvider: "Serverless",
  serverlessConfig: {
    executablePath: await chromium.executablePath(),
    options: { args: chromium.args },
    proxy: {
      host: "proxy.example.com",
      port: 8080,
      auth: { username: "user", password: "pass" },
    } as AxiosProxyConfig,
  },
});

export const handler = async () => {
  const page = await agent.newPage();
  await page.goto("https://ycombinator.com/companies");
  await page.ai("Find real estate YC startups in the latest two batches");
};
```
</details>

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Forked from [HyperAgent](https://github.com/hyperbrowserai/HyperAgent) version b49afe under MIT License
- Browser support in serverless environments by [@sparticuz/chromium](https://github.com/Sparticuz/chromium)
