import { ActionContext } from "@lightfeed/browser-agent/types";

export function getLocator(ctx: ActionContext, index: number) {
  const element = ctx.domState.elements.get(index);
  if (!element) {
    return null;
  }
  if (element.isUnderShadowRoot) {
    return ctx.page.locator(element.cssPath);
  } else {
    return ctx.page.locator(`xpath=${element.xpath}`);
  }
}
