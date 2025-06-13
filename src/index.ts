import { BrowserAgent } from "./agent";
import { TaskStatus } from "./types/agent/types";

export { TaskStatus, BrowserAgent };
export default BrowserAgent;

// For CommonJS compatibility
if (typeof module !== "undefined" && module.exports) {
  module.exports = BrowserAgent;
  module.exports.BrowserAgent = BrowserAgent;
  module.exports.TaskStatus = TaskStatus;
  module.exports.default = BrowserAgent;
}
