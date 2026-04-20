import {
  INTERACTIVE_ELEMENTS,
  INTERACTIVE_ROLES,
  INTERACTIVE_ARIA_PROPS,
  CLICK_ATTRIBUTES,
} from "./const";

export const isInteractiveElem = (
  element: HTMLElement
): { isInteractive: boolean; reason: string } => {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const ariaRole = element.getAttribute("aria-role");

  const hasInteractiveRole =
    INTERACTIVE_ELEMENTS.has(tagName) ||
    INTERACTIVE_ROLES.has(role || "") ||
    INTERACTIVE_ROLES.has(ariaRole || "");

  if (hasInteractiveRole) {
    let reason = "";
    if (INTERACTIVE_ELEMENTS.has(tagName)) {
      reason = `Interactive HTML element: <${tagName}>`;
    } else if (INTERACTIVE_ROLES.has(role || "")) {
      reason = `Interactive role: ${role}`;
    } else if (INTERACTIVE_ROLES.has(ariaRole || "")) {
      reason = `Interactive aria-role: ${ariaRole}`;
    }
    return { isInteractive: true, reason };
  }

  const hasClickHandler =
    element.onclick !== null ||
    element.getAttribute("onclick") !== null ||
    CLICK_ATTRIBUTES.some((attr) => element.hasAttribute(attr));

  if (hasClickHandler) {
    return { isInteractive: true, reason: "Has click handler" };
  }

  // Check for the marker attribute set by the injected script
  const hasInjectedListener = element.hasAttribute("data-has-interactive-listener");

  if (hasInjectedListener) {
    return { isInteractive: true, reason: "Has interactive event listener (tracked)" };
  }

  const hasAriaProps = INTERACTIVE_ARIA_PROPS.some((prop) =>
    element.hasAttribute(prop)
  );

  if (hasAriaProps) {
    const props = INTERACTIVE_ARIA_PROPS.filter((prop) =>
      element.hasAttribute(prop)
    );
    return {
      isInteractive: true,
      reason: `Has interactive ARIA properties: ${props.join(", ")}`,
    };
  }

  const isContentEditable =
    element.getAttribute("contenteditable") === "true" ||
    element.isContentEditable;

  if (isContentEditable) {
    return { isInteractive: true, reason: "Is content editable" };
  }

  const isDraggable =
    element.draggable || element.getAttribute("draggable") === "true";

  if (isDraggable) {
    return { isInteractive: true, reason: "Is draggable" };
  }

  // Many sites (especially older WordPress / jQuery themes) attach click
  // handlers to plain `<div>` elements without setting any role / aria
  // attribute, and only set `cursor: pointer` on `:hover`. Their click
  // handlers are typically attached via event delegation, so the
  // `data-has-interactive-listener` marker above doesn't fire either.
  //
  // To recover those, we walk the page's stylesheets once and collect every
  // selector that sets `cursor: pointer` inside a `:hover` rule, then check
  // whether the element matches any of those selectors.
  for (const selector of getHoverPointerSelectors()) {
    try {
      if (element.matches(selector)) {
        return { isInteractive: true, reason: "Has cursor: pointer on hover" };
      }
    } catch {
      // Invalid selector (e.g. `:has()` in older browsers) — skip.
    }
  }

  return { isInteractive: false, reason: "Not interactive" };
};

/**
 * Walks every accessible stylesheet on the page and returns the list of base
 * selectors (with `:hover` stripped) whose `:hover` rule sets
 * `cursor: pointer`. Cached across calls so we only pay the CSSOM walk once
 * per injected script execution.
 *
 * Cross-origin stylesheets throw on `cssRules` access — those are silently
 * skipped, which means we miss buttons styled by 3rd-party CSS, but that is
 * an acceptable trade-off (and very rare for primary page content).
 */
let _hoverPointerSelectorsCache: string[] | null = null;
const getHoverPointerSelectors = (): string[] => {
  if (_hoverPointerSelectorsCache !== null) {
    return _hoverPointerSelectorsCache;
  }
  const selectors: string[] = [];

  const visitRules = (rules: CSSRuleList) => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      // Descend into @media / @supports / etc. (CSSGroupingRule).
      const groupingRules = (rule as unknown as { cssRules?: CSSRuleList })
        .cssRules;
      if (groupingRules) {
        try {
          visitRules(groupingRules);
        } catch {
          // Some grouping rule types throw on access — skip.
        }
      }
      const styleRule = rule as CSSStyleRule;
      if (
        !styleRule.selectorText ||
        !styleRule.style ||
        styleRule.style.cursor !== "pointer"
      ) {
        continue;
      }
      // A rule's selectorText may be a comma-separated list, e.g.
      // ".btn:hover, .card:hover, .footer-link". Split, keep only the
      // segments that contain :hover, strip :hover from each, and re-emit.
      const segments = styleRule.selectorText.split(",");
      for (const raw of segments) {
        const segment = raw.trim();
        if (!segment.includes(":hover")) continue;
        const base = segment.replace(/:hover\b/g, "").trim();
        if (base) selectors.push(base);
      }
    }
  };

  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet — skip.
      continue;
    }
    if (rules) visitRules(rules);
  }

  _hoverPointerSelectorsCache = selectors;
  return selectors;
};

export const isIgnoredElem = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const isNotVisible = rect.width === 0 || rect.height === 0;

  return (
    element.tagName.toLowerCase() === "html" ||
    element.tagName.toLowerCase() === "body" ||
    isNotVisible ||
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
};
