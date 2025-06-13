import { chromium, Browser, LaunchOptions } from "playwright";
import { AxiosProxyConfig } from "axios";
import BrowserProvider from "@/types/browser-providers/types";

export class ServerlessBrowserProvider extends BrowserProvider<Browser> {
  options: Omit<Omit<LaunchOptions, "headless">, "channel"> | undefined;
  session: Browser | undefined;
  executablePath: string;
  proxy: AxiosProxyConfig | null;

  constructor(params: {
    options?: Omit<Omit<LaunchOptions, "headless">, "channel">;
    executablePath: string;
    proxy?: AxiosProxyConfig;
  }) {
    super();
    this.options = params.options;
    this.executablePath = params.executablePath;
    this.proxy = params.proxy ?? null;
  }

  async start(): Promise<Browser> {
    const launchArgs = this.options?.args ?? [];
    const browser = await chromium.launch({
      ...(this.options ?? {}),
      headless: true,
      executablePath: this.executablePath,
      args: ["--disable-blink-features=AutomationControlled", ...launchArgs],
      ...(this.proxy == null
        ? {}
        : {
            proxy: {
              server: `http://${this.proxy.host}:${this.proxy.port}`,
              username: this.proxy.auth?.username,
              password: this.proxy.auth?.password,
            },
          }),
    });
    this.session = browser;
    return this.session;
  }

  async close(): Promise<void> {
    return await this.session?.close();
  }

  public getSession() {
    if (!this.session) {
      return null;
    }
    return this.session;
  }
}
