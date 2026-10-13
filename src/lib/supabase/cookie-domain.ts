/**
 * Shared Supabase auth cookie scope for production (task 0e05333f).
 *
 * In production every Supabase cookie write uses `Domain=.audiolad.ru`, so a
 * session created on audiolad.ru is visible on business.audiolad.ru (and other
 * first-party subdomains). Any other host (localhost, 127.0.0.1, previews)
 * keeps host-only cookies — derived from the actual request/document host,
 * there is no user-visible toggle.
 *
 * Legacy host-only cookies (written before this change) are migrated in the
 * proxy: re-issued with the domain scope and the host-only copy expired, so no
 * two same-name cookies linger. Every later write/removal also expires the
 * host-only variant, so logout clears both and logs out on all subdomains.
 */
import type { SerializeOptions } from "cookie";

import { cookieNameLooksLikeSupabaseAuth, getSupabaseAuthStorageKey } from "./auth-cookie";

export const PRODUCTION_COOKIE_PARENT_DOMAIN = "audiolad.ru";
export const PRODUCTION_SUPABASE_COOKIE_DOMAIN = ".audiolad.ru";
/** Domain-scoped marker: host-only legacy cookies were already migrated. */
export const SUPABASE_COOKIE_SCOPE_MARKER = "al-auth-scope";
export const SUPABASE_COOKIE_SCOPE_MARKER_VALUE = "d1";

/** Minimal RFC 6265 serializer (avoid a direct runtime dep on `cookie`). */
export function serialize(
  name: string,
  value: string,
  options: SerializeOptions = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  const sameSite = options.sameSite;
  if (sameSite === true || sameSite === "strict") parts.push("SameSite=Strict");
  else if (sameSite === "lax") parts.push("SameSite=Lax");
  else if (sameSite === "none") parts.push("SameSite=None");
  return parts.join("; ");
}

/** Parse `document.cookie`; for duplicate names the FIRST wins (same as @supabase/ssr default). */
export function parseCookieHeader(header: string): Array<{ name: string; value: string }> {
  const map = new Map<string, string>();
  for (const pair of header.split(/; */)) {
    if (!pair) continue;
    const at = pair.indexOf("=");
    if (at === -1) continue;
    const name = pair.slice(0, at).trim();
    let value = pair.slice(at + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw
    }
    if (!map.has(name)) map.set(name, value);
  }
  return [...map].map(([name, value]) => ({ name, value }));
}

function normalize(hostname: string | null | undefined): string {
  const raw = (hostname ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("[")) return raw; // IPv6 literal — never production
  return (raw.split(":")[0] ?? "").replace(/\.$/, "");
}

/** `.audiolad.ru` for audiolad.ru and *.audiolad.ru, otherwise undefined (host-only). */
export function resolveSupabaseCookieDomain(
  hostname: string | null | undefined,
): string | undefined {
  const host = normalize(hostname);
  if (!host) return undefined;
  if (
    host === PRODUCTION_COOKIE_PARENT_DOMAIN ||
    host.endsWith(`.${PRODUCTION_COOKIE_PARENT_DOMAIN}`)
  ) {
    return PRODUCTION_SUPABASE_COOKIE_DOMAIN;
  }
  return undefined;
}

/**
 * Options merged into every Supabase cookie write. Production (https only)
 * adds `Secure` so a later write cannot silently drop it.
 */
export function getSupabaseCookieOptions(
  hostname: string | null | undefined,
): { domain?: string; secure?: boolean } {
  const domain = resolveSupabaseCookieDomain(hostname);
  return domain ? { domain, secure: true } : {};
}

/** The only host where legacy host-only cookies are re-issued (login lives here). */
export function isSessionOriginHost(hostname: string | null | undefined): boolean {
  return normalize(hostname) === PRODUCTION_COOKIE_PARENT_DOMAIN;
}

export function hostnameFromHeaders(headers: {
  get(name: string): string | null;
}): string {
  return normalize(headers.get("x-forwarded-host")?.split(",")[0] ?? headers.get("host"));
}

/** `Set-Cookie` line that expires the legacy host-only variant (no Domain). */
export function serializeHostOnlyExpiry(
  name: string,
  options: Pick<SerializeOptions, "path" | "secure" | "sameSite"> = {},
): string {
  return serialize(name, "", {
    path: options.path ?? "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: options.sameSite ?? "lax",
    secure: options.secure,
    httpOnly: false,
  });
}

export type SupabaseCookieWrite = {
  name: string;
  value: string;
  options: SerializeOptions;
};

export type SupabaseCookieScopePlan = {
  /** Raw `Set-Cookie` lines to append after Next's own cookie serialization. */
  lines: string[];
  /**
   * - `none`: nothing to migrate on this host;
   * - `reissue`: apex legacy cookies re-issued with Domain (session kept);
   * - `expire_only`: subdomain legacy host-only cookies expired, NOT re-issued
   *   (a stale host-only session must never be promoted to all subdomains,
   *   e.g. after logout elsewhere). Request must be treated as anonymous.
   */
  mode: "none" | "reissue" | "expire_only";
  /** Supabase auth cookie names present in the request (for expire_only). */
  legacyNames: string[];
};

/**
 * Per-host migration of legacy host-only Supabase cookies (production only).
 * The marker is HOST-ONLY on purpose: each host migrates its own legacy twins.
 * Also: every Supabase cookie written in this response expires its host-only twin.
 */
export function planSupabaseCookieScope(input: {
  hostname: string;
  supabaseUrl: string | undefined;
  requestCookies: ReadonlyArray<{ name: string; value: string }>;
  written: ReadonlyArray<SupabaseCookieWrite>;
}): SupabaseCookieScopePlan {
  const none: SupabaseCookieScopePlan = { lines: [], mode: "none", legacyNames: [] };
  const domain = resolveSupabaseCookieDomain(input.hostname);
  if (!domain || !input.supabaseUrl) return none;

  let storageKey: string;
  try {
    storageKey = getSupabaseAuthStorageKey(input.supabaseUrl);
  } catch {
    return none;
  }

  const lines: string[] = [];
  const expired = new Set<string>();
  const expireHostOnly = (name: string) => {
    if (expired.has(name)) return;
    expired.add(name);
    lines.push(serializeHostOnlyExpiry(name, { secure: true }));
  };

  const writtenNames = new Set(input.written.map((c) => c.name));
  for (const cookie of input.written) {
    if (cookieNameLooksLikeSupabaseAuth(cookie.name, storageKey)) {
      expireHostOnly(cookie.name);
    }
  }

  const markerPresent = input.requestCookies.some(
    (c) =>
      c.name === SUPABASE_COOKIE_SCOPE_MARKER &&
      c.value === SUPABASE_COOKIE_SCOPE_MARKER_VALUE,
  );
  const legacy = input.requestCookies.filter((c) =>
    cookieNameLooksLikeSupabaseAuth(c.name, storageKey),
  );

  if (markerPresent || legacy.length === 0) {
    return { lines, mode: "none", legacyNames: [] };
  }

  const reissue = isSessionOriginHost(input.hostname);
  for (const cookie of legacy) {
    expireHostOnly(cookie.name);
    if (reissue && !writtenNames.has(cookie.name)) {
      lines.push(
        serialize(cookie.name, cookie.value, {
          domain,
          path: "/",
          sameSite: "lax",
          secure: true,
          httpOnly: false,
          maxAge: 400 * 24 * 60 * 60,
        }),
      );
    }
  }
  lines.push(
    serialize(SUPABASE_COOKIE_SCOPE_MARKER, SUPABASE_COOKIE_SCOPE_MARKER_VALUE, {
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
      maxAge: 400 * 24 * 60 * 60,
    }),
  );

  return {
    lines,
    mode: reissue ? "reissue" : "expire_only",
    legacyNames: legacy.map((c) => c.name),
  };
}

/** Browser: expire host-only twins of names just written with the domain scope. */
export function expireHostOnlyInDocument(names: Iterable<string>): void {
  if (typeof document === "undefined") return;
  if (!resolveSupabaseCookieDomain(window.location.hostname)) return;
  const secure = window.location.protocol === "https:";
  for (const name of names) {
    document.cookie = serializeHostOnlyExpiry(name, { secure });
  }
}
