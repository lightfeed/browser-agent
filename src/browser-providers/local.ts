import { chromium, Browser, LaunchOptions } from "playwright";
import BrowserProvider from "@/types/browser-providers/types";
import { AxiosProxyConfig } from "axios";

export class LocalBrowserProvider extends BrowserProvider<Browser> {
  options: Omit<Omit<LaunchOptions, "headless">, "channel"> | undefined;
  session: Browser | undefined;
  proxy: AxiosProxyConfig | null;

  constructor(params: {
    options?: Omit<Omit<LaunchOptions, "headless">, "channel">;
    proxy?: AxiosProxyConfig;
  }) {
    super();
    this.options = params.options;
    this.proxy = params.proxy ?? null;
  }
  async start(): Promise<Browser> {
    const launchArgs = this.options?.args ?? [];
    const browser = await chromium.launch({
      ...(this.options ?? {}),
      channel: "chrome",
      headless: false,
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
