import {
  ActionContext,
  ResolvedLocator,
} from "@lightfeed/browser-agent/types";
import { Locator, Page } from "playwright";

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

/**
 * Resolve a locator along with the selector info needed to later replay the
 * action deterministically. Accepts either an index into the live DOM state,
 * a raw Playwright selector string, or a pre-resolved locator descriptor.
 */
export function resolveLocator(
  ctx: ActionContext,
  target: number | string | ResolvedLocator
): { locator: Locator; resolved: ResolvedLocator } | null {
  if (typeof target === "number") {
    const element = ctx.domState.elements.get(target);
    if (!element) {
      return null;
    }
    const resolved: ResolvedLocator = {
      xpath: element.xpath,
      cssPath: element.cssPath,
      isUnderShadowRoot: element.isUnderShadowRoot,
    };
    return { locator: locatorFromResolved(ctx.page, resolved), resolved };
  }

  if (typeof target === "string") {
    const selector = target.trim();
    const isXpath =
      selector.startsWith("xpath=") ||
      selector.startsWith("/") ||
      selector.startsWith("(");
    if (isXpath) {
      const xpath = selector.startsWith("xpath=")
        ? selector.slice("xpath=".length)
        : selector;
      const resolved: ResolvedLocator = {
        xpath,
        cssPath: "",
        isUnderShadowRoot: false,
      };
      return { locator: ctx.page.locator(`xpath=${xpath}`), resolved };
    }
    const resolved: ResolvedLocator = {
      xpath: "",
      cssPath: selector,
      isUnderShadowRoot: false,
    };
    return { locator: ctx.page.locator(selector), resolved };
  }

  return {
    locator: locatorFromResolved(ctx.page, target),
    resolved: target,
  };
}

export function locatorFromResolved(
  page: Page,
  resolved: ResolvedLocator
): Locator {
  if (resolved.isUnderShadowRoot && resolved.cssPath) {
    return page.locator(resolved.cssPath);
  }
  if (resolved.xpath) {
    return page.locator(`xpath=${resolved.xpath}`);
  }
  return page.locator(resolved.cssPath);
}
