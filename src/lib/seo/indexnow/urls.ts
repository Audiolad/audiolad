import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { SEO_ROBOTS_DISALLOWED_PATHS } from "@/lib/seo/robots-config";

const ALLOWED_HOSTS = new Set(["audiolad.ru", "www.audiolad.ru"]);

/** Extra private prefixes beyond robots disallow list. */
const EXTRA_PRIVATE_PREFIXES = [
  "/_next/",
  "/admin",
  "/api",
  "/auth",
  "/d/",
  "/listen",
  "/profile",
  "/my-practices",
  "/my-materials",
  "/favorites",
  "/history",
  "/downloads",
  "/purchases",
  "/playlists/",
  "/playlist/",
  "/settings",
  "/author-dashboard",
  "/personal-materials",
  "/checkout",
  "/program/inner-support",
] as const;

export type IndexNowUrlRejectReason =
  | "empty"
  | "invalid_url"
  | "foreign_host"
  | "private_path"
  | "unsupported_scheme";

export type IndexNowUrlAccept = {
  ok: true;
  url: string;
  path: string;
};

export type IndexNowUrlReject = {
  ok: false;
  input: string;
  reason: IndexNowUrlRejectReason;
};

export type IndexNowUrlNormalizeResult = IndexNowUrlAccept | IndexNowUrlReject;

export type IndexNowUrlBatchResult = {
  accepted: string[];
  rejected: IndexNowUrlReject[];
};

function collectPrivatePrefixes(): string[] {
  const fromRobots = SEO_ROBOTS_DISALLOWED_PATHS.map((prefix) => prefix);
  return [...new Set([...fromRobots, ...EXTRA_PRIVATE_PREFIXES])];
}

const PRIVATE_PREFIXES = collectPrivatePrefixes();

export function isPrivateIndexNowPath(pathname: string): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (path === "/api" || path.startsWith("/api/")) {
    return true;
  }

  for (const prefix of PRIVATE_PREFIXES) {
    if (prefix.endsWith("/")) {
      if (path === prefix.slice(0, -1) || path.startsWith(prefix)) {
        return true;
      }
      continue;
    }

    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  // Preview / diagnostics query surfaces often appear as path suffixes in apps;
  // strip query separately — also block explicit preview path segments.
  if (
    path.includes("/preview") ||
    path.startsWith("/diagnostics") ||
    path.includes("/diagnostics/")
  ) {
    return true;
  }

  return false;
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  const withLeading = pathname.startsWith("/") ? pathname : `/${pathname}`;
  // Collapse duplicate slashes; drop trailing slash for non-root.
  const collapsed = withLeading.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }

  return collapsed;
}

function toAbsoluteCanonicalUrl(pathname: string): string {
  const path = normalizePathname(pathname);

  if (path === "/") {
    return `${PRODUCTION_APP_ORIGIN}/`;
  }

  return `${PRODUCTION_APP_ORIGIN}${path}`;
}

/**
 * Normalize a path or absolute URL into a canonical IndexNow URL.
 * Query strings and fragments are dropped. Foreign hosts rejected.
 */
export function normalizeIndexNowUrl(
  input: string | null | undefined,
): IndexNowUrlNormalizeResult {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, input: String(input ?? ""), reason: "empty" };
  }

  const trimmed = input.trim();

  try {
    let pathname: string;

    if (trimmed.startsWith("/")) {
      // Path-only: ignore any accidental "?…" by parsing against production origin.
      const parsed = new URL(trimmed, `${PRODUCTION_APP_ORIGIN}/`);
      pathname = parsed.pathname;
    } else {
      const parsed = new URL(trimmed);

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, input: trimmed, reason: "unsupported_scheme" };
      }

      const host = parsed.hostname.toLowerCase();

      if (!ALLOWED_HOSTS.has(host)) {
        return { ok: false, input: trimmed, reason: "foreign_host" };
      }

      pathname = parsed.pathname;
    }

    const path = normalizePathname(pathname);

    if (isPrivateIndexNowPath(path)) {
      return { ok: false, input: trimmed, reason: "private_path" };
    }

    return {
      ok: true,
      path,
      url: toAbsoluteCanonicalUrl(path),
    };
  } catch {
    return { ok: false, input: trimmed, reason: "invalid_url" };
  }
}

/** Normalize many inputs; dedupe accepted absolute URLs. */
export function normalizeIndexNowUrls(
  inputs: ReadonlyArray<string | null | undefined>,
): IndexNowUrlBatchResult {
  const accepted: string[] = [];
  const seen = new Set<string>();
  const rejected: IndexNowUrlReject[] = [];

  for (const input of inputs) {
    const result = normalizeIndexNowUrl(input);

    if (!result.ok) {
      rejected.push(result);
      continue;
    }

    if (seen.has(result.url)) {
      continue;
    }

    seen.add(result.url);
    accepted.push(result.url);
  }

  return { accepted, rejected };
}

/** Split accepted URLs into IndexNow-sized batches. */
export function batchIndexNowUrls(
  urls: ReadonlyArray<string>,
  batchSize: number,
): string[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const batches: string[][] = [];

  for (let index = 0; index < urls.length; index += size) {
    batches.push(urls.slice(index, index + size));
  }

  return batches;
}
