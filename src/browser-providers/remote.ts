import {
  chromium,
  Browser,
  ConnectOverCDPOptions,
} from "rebrowser-playwright-core";
import BrowserProvider from "@/types/browser-providers/types";

export class RemoteBrowserProvider extends BrowserProvider<Browser> {
  options: Omit<ConnectOverCDPOptions, "endpointURL"> | undefined;
  session: Browser | undefined;
  wsEndpoint: string;

  constructor(params: {
    wsEndpoint: string;
    options?: Omit<ConnectOverCDPOptions, "endpointURL">;
  }) {
    super();
    this.wsEndpoint = params.wsEndpoint;
    this.options = params.options;
  }

  async start(): Promise<Browser> {
    const browser = await chromium.connectOverCDP(
      this.wsEndpoint,
      this.options
    );
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
