export const PROMO_PAGE_CTA_HEADING_MAX_LENGTH = 120;
export const PROMO_PAGE_CTA_DESCRIPTION_MAX_LENGTH = 500;

const DISALLOWED_INTERNAL_PREFIXES = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/api/",
] as const;

/**
 * Hosts that serve the AudioLad listener app itself. An absolute https link to
 * one of them (e.g. «https://audiolad.ru/practice/…» pasted by an author) is
 * treated as an internal path so the button uses client-side navigation and
 * the persistent bottom player keeps playing instead of a full page reload.
 */
const SAME_SITE_HOSTS = new Set(["audiolad.ru", "www.audiolad.ru"]);

const BLOCKED_SCHEMES = [
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
] as const;

export type PromoPageCtaTarget =
  | {
      kind: "internal";
      href: string;
    }
  | {
      kind: "external";
      href: string;
      host: string;
    };

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function decodeSafely(value: string): string | null {
  let decoded = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
  }

  return decoded;
}

function getPathnameFromInternalHref(href: string): string {
  const withoutHash = href.split("#")[0] ?? href;
  return withoutHash.split("?")[0] ?? withoutHash;
}

function isBlockedScheme(value: string): boolean {
  const lower = value.trim().toLowerCase();

  return BLOCKED_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

function isDisallowedInternalPath(pathname: string): boolean {
  return DISALLOWED_INTERNAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

function resolveInternalTarget(trimmed: string): PromoPageCtaTarget | "invalid" {
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "invalid";
  }

  if (trimmed.includes("\\")) {
    return "invalid";
  }

  if (trimmed.includes("://")) {
    return "invalid";
  }

  if (isBlockedScheme(trimmed)) {
    return "invalid";
  }

  const decoded = decodeSafely(trimmed);

  if (decoded == null) {
    return "invalid";
  }

  if (decoded.startsWith("//")) {
    return "invalid";
  }

  const pathname = getPathnameFromInternalHref(decoded);

  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return "invalid";
  }

  if (isDisallowedInternalPath(pathname)) {
    return "invalid";
  }

  return {
    kind: "internal",
    href: trimmed,
  };
}

function resolveExternalTarget(trimmed: string): PromoPageCtaTarget | "invalid" {
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return "invalid";
  }

  if (parsed.protocol !== "https:") {
    return "invalid";
  }

  const host = parsed.hostname.trim().toLowerCase();

  if (!host) {
    return "invalid";
  }

  if (parsed.username || parsed.password) {
    return "invalid";
  }

  if (SAME_SITE_HOSTS.has(host) && !parsed.port) {
    const internal = resolveInternalTarget(
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
    );

    if (internal !== "invalid") {
      return internal;
    }
  }

  return {
    kind: "external",
    href: parsed.toString(),
    host,
  };
}

export function resolvePromoPageCtaTarget(
  value: string | null | undefined,
): PromoPageCtaTarget | null | "invalid" {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 512) {
    return "invalid";
  }

  if (hasControlCharacters(trimmed)) {
    return "invalid";
  }

  if (isBlockedScheme(trimmed)) {
    return "invalid";
  }

  if (trimmed.startsWith("//")) {
    return "invalid";
  }

  const lower = trimmed.toLowerCase();

  if (lower.startsWith("http://")) {
    return "invalid";
  }

  if (lower.startsWith("https://")) {
    return resolveExternalTarget(trimmed);
  }

  return resolveInternalTarget(trimmed);
}

export function isInvalidPromoPageCtaTarget(
  value: string | null | undefined,
): boolean {
  return resolvePromoPageCtaTarget(value) === "invalid";
}

export function getPromoPageCtaPreviewLabel(
  value: string | null | undefined,
): string | null {
  const target = resolvePromoPageCtaTarget(value);

  if (target == null || target === "invalid") {
    return null;
  }

  if (target.kind === "internal") {
    return "Внутренняя страница АудиоЛада";
  }

  return `Откроется: ${target.host}`;
}

export function getPromoPageCtaOpenModeLabel(openInNewTab: boolean): string {
  return openInNewTab ? "new_tab" : "same_tab";
}
