# Serverless Browser Agent ⚡️

A powerful AI agent that can automatically navigate and interact with serverless web browsers using natural language prompts. This project is a fork of [HyperAgent](https://github.com/hyperbrowserai/HyperAgent) with additional features for serverless and remote browser support.

## Installation

```bash
npm install @lightfeed/browser-agent
```

## Quick Start

### Serverless

```typescript
import { BrowserAgent } from '@lightfeed/browser-agent';
import chromium from '@sparticuz/chromium';
import { AxiosProxyConfig } from 'axios';

const agent = new BrowserAgent({
  browserProvider: 'Serverless',
  serverlessConfig: {
    executablePath: await chromium.executablePath(),
    options: {
      args: chromium.args,
    },
    proxy: {
      host: 'proxy.example.com',
      port: 8080,
      auth: {
        username: 'user',
        password: 'pass'
      }
    } as AxiosProxyConfig
  }
});

// Example Lambda handler
export const handler = async (event) => {
  const page = await agent.newPage();
  await page.goto('https://ycombinator.com/companies');

  page.ai('Find real estate YC startups in the latest two batches');
};
```

### Remote Browser

```typescript
import { BrowserAgent } from '@lightfeed/browser-agent';

const agent = new BrowserAgent({
  browserProvider: 'Remote',
  remoteConfig: {
    browserWSEndpoint: 'ws://your-remote-browser:9222/devtools/browser/ws'
  }
});

const page = await agent.newPage();
await page.goto('https://amazon.com');

page.ai('Search for organic products and go to the second page');
```

### Local Browser

```typescript
import { BrowserAgent } from '@lightfeed/browser-agent';

const agent = new BrowserAgent({
  browserProvider: 'Local'
});

const page = await agent.newPage();
await page.goto('https://news.ycombinator.com');

page.ai('Navigate to show section and go to the second post');
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Original work by [HyperAgent](https://github.com/hyperbrowserai/HyperAgent)
- Browser support in serverless environments by [@sparticuz/chromium](https://github.com/Sparticuz/chromium)
