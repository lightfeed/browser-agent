<h1 align="center">
  Serverless Browser Agent ⚡️
</h1>

<p align="center">
  <strong>Use AI to navigate and interact with web browsers in serverless platforms</strong>
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

## Installation

```bash
npm install @lightfeed/browser-agent
```

## Quick Start

### Serverless

Perfect for AWS Lambda and other serverless environments. Uses [@sparticuz/chromium](https://github.com/Sparticuz/chromium) to run Chrome in serverless environments with minimal cold start times and memory usage. Supports proxy configuration for geo-tracking and unblocking.

> [!IMPORTANT]
> This project uses Playwright, which ships with a specific version of Chromium. You need to install the matching version of `@sparticuz/chromium`. For example, we are using [Playwright 1.48](https://playwright.dev/docs/release-notes#version-148) (which supports to Chromium 130), you should install `@sparticuz/chromium@130`.
> For running on AWS Lambda, lambda layer with ARM64 architecture is preferred. You will also need to install dependencies of canvas.

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";
import chromium from "@sparticuz/chromium";
import { AxiosProxyConfig } from "axios";

const agent = new BrowserAgent({
  browserProvider: "Serverless",
  serverlessConfig: {
    executablePath: await chromium.executablePath(),
    options: {
      args: chromium.args,
    },
    // Use proxy (optional)
    proxy: {
      host: "proxy.example.com",
      port: 8080,
      auth: {
        username: "user",
        password: "pass"
      }
    } as AxiosProxyConfig
  }
});

// Example Lambda handler
export const handler = async (event) => {
  const page = await agent.newPage();
  await page.goto("https://ycombinator.com/companies");

  page.ai("Find real estate YC startups in the latest two batches");
  // ...
};
```

### Remote Browser

Connect to any remote browser instance via WebSocket. Great for:
- Brightdata's Scraping Browser
- Custom browser instances in the cloud
- Browser farms and proxy services

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";

const agent = new BrowserAgent({
  browserProvider: "Remote",
  remoteConfig: {
    browserWSEndpoint: "ws://your-remote-browser:9222/devtools/browser/ws"
  }
});

const page = await agent.newPage();
await page.goto("https://amazon.com");

page.ai("Search for organic products and go to the second page");
```

### Local Browser

Use your local Chrome browser for development and testing. Perfect for:
- Local development and debugging
- Testing automation scripts
- Quick prototyping

```typescript
import { BrowserAgent } from "@lightfeed/browser-agent";

const agent = new BrowserAgent({
  browserProvider: "Local"
});

const page = await agent.newPage();
await page.goto("https://news.ycombinator.com");

page.ai("Navigate to show section and go to the second post");
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Forked from [HyperAgent](https://github.com/hyperbrowserai/HyperAgent) version b49afe under MIT License
- Browser support in serverless environments by [@sparticuz/chromium](https://github.com/Sparticuz/chromium)
