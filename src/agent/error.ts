export class BrowserAgentError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(`[BrowserAgent]: ${message}`);
    this.name = "BrowserAgentError";
  }
}
