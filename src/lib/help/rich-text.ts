import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

import type {
  HelpInlineLink,
  HelpInlineNode,
  HelpInlineText,
  HelpRichText,
} from "@/lib/help/types";

export function helpText(value: string): HelpInlineText {
  return { type: "text", value };
}

/**
 * Public help-center link: relative href, absolute display label for users.
 */
export function helpPublicLink(
  href: string,
  options?: { label?: string; external?: boolean },
): HelpInlineLink {
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;
  const origin = PRODUCTION_APP_ORIGIN.replace(/\/$/, "");
  return {
    type: "link",
    href: normalizedHref,
    label: options?.label ?? `${origin}${normalizedHref}`,
    ...(options?.external ? { external: true } : {}),
  };
}

/** Build a rich-text node list from mixed strings and inline nodes. */
export function helpRich(
  ...parts: Array<string | HelpInlineNode>
): HelpInlineNode[] {
  return parts.map((part) =>
    typeof part === "string" ? helpText(part) : part,
  );
}

export function isHelpRichNodes(
  value: HelpRichText,
): value is HelpInlineNode[] {
  return Array.isArray(value);
}

export function flattenHelpRichText(value: HelpRichText): string {
  if (typeof value === "string") {
    return value;
  }

  return value
    .map((node) => (node.type === "text" ? node.value : node.label))
    .join("");
}

export function collectHelpRichTexts(
  values: readonly HelpRichText[] | undefined,
): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  return values.map(flattenHelpRichText);
}

/** Paths that must never appear as bare prose once converted to rich links. */
const BARE_ROUTE_IN_PROSE_RE =
  /(?:^|[\s(«"'])(\/(?:auth|author-dashboard|help|catalog|listen|author-terms|profile|settings|my-practices|my-materials|become-author|articles|authors|topics|practice|promo)(?:\/[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_~-]+)*)*)(?=$|[\s).,;:»"'])/g;

export function findBareRoutesInProse(value: string): string[] {
  const found: string[] = [];
  for (const match of value.matchAll(BARE_ROUTE_IN_PROSE_RE)) {
    const route = match[1];
    if (!route) continue;
    // Allow documented technical templates, not concrete user destinations.
    if (route.includes("[") || route.includes("{") || route.includes("*")) {
      continue;
    }
    if (route.startsWith("/d/") || route.startsWith("/api/")) {
      continue;
    }
    found.push(route);
  }
  return found;
}
