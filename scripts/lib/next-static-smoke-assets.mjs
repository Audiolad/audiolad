/**
 * Pure helpers for candidate HTTP smoke: classify Next /_next/static
 * CSS/JS URLs under optional Next.js assetPrefix (CDN).
 *
 * Does not load dotenv globally and never logs env-file contents.
 */

const PREFIX_KEY = "NEXT_PUBLIC_CDN_ASSET_PREFIX";
const NEXT_STATIC_PREFIX = "/_next/static/";

export function normalizeAssetPrefix(raw) {
  if (raw == null) return undefined;
  const prefix = String(raw).trim().replace(/\/+$/, "");
  return prefix === "" ? undefined : prefix;
}

function unquoteEnvValue(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function readPrefixFromEnvFile(text) {
  if (typeof text !== "string" || text.length === 0) return undefined;
  let found;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(
      /^(?:export\s+)?NEXT_PUBLIC_CDN_ASSET_PREFIX\s*=\s*(.*)$/,
    );
    if (!match) continue;
    found = unquoteEnvValue(match[1].trim());
  }
  return found;
}

export function resolveSmokeAssetPrefix({ env = {}, envFileText } = {}) {
  const fromEnv = normalizeAssetPrefix(env[PREFIX_KEY]);
  if (fromEnv) return fromEnv;
  return normalizeAssetPrefix(readPrefixFromEnvFile(envFileText));
}

const REF_RE = /(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

export function extractCandidateRefs(html) {
  if (typeof html !== "string" || html.length === 0) return [];
  const refs = [];
  for (const match of html.matchAll(REF_RE)) {
    const raw = match[1] ?? match[2];
    if (raw) refs.push(raw);
  }
  return refs;
}

function parseUrl(raw, pageOrigin) {
  try {
    return pageOrigin ? new URL(raw, pageOrigin) : new URL(raw);
  } catch {
    return null;
  }
}

function originOf(value) {
  if (value == null || value === "") return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function assetKind(pathname) {
  if (pathname.endsWith(".css")) return "css";
  if (pathname.endsWith(".js")) return "js";
  return null;
}

export function classifyNextStaticAsset(raw, { pageOrigin, assetPrefix } = {}) {
  if (typeof raw !== "string") return { skip: true };
  const trimmed = raw.trim();
  if (!trimmed) return { skip: true };

  const url = parseUrl(trimmed, pageOrigin);
  if (!url) return { skip: true };

  const pathname = url.pathname;
  if (!pathname.startsWith(NEXT_STATIC_PREFIX)) {
    return { skip: true };
  }

  const prefix = normalizeAssetPrefix(assetPrefix);
  const expectedOrigin = prefix
    ? originOf(prefix)
    : originOf(pageOrigin);

  if (!expectedOrigin) {
    return { ok: false, reason: `cannot resolve expected origin for ${trimmed}` };
  }

  if (url.origin !== expectedOrigin) {
    return {
      ok: false,
      reason: prefix
        ? `rejected ${trimmed}: host ${url.origin} does not match CDN prefix ${expectedOrigin}`
        : `rejected ${trimmed}: host ${url.origin} is not same-origin ${expectedOrigin}`,
    };
  }

  const kind = assetKind(pathname);
  if (!kind) return { skip: true };

  return { ok: true, href: url.href, kind };
}

export function collectAllowedNextStaticAssets(html, opts = {}) {
  const css = [];
  const js = [];
  const errors = [];
  const seenCss = new Set();
  const seenJs = new Set();

  for (const raw of extractCandidateRefs(html)) {
    const result = classifyNextStaticAsset(raw, opts);
    if (result.skip) continue;
    if (result.ok === false) {
      errors.push(result.reason ?? `rejected ${raw}`);
      continue;
    }
    if (result.kind === "css") {
      if (!seenCss.has(result.href)) {
        seenCss.add(result.href);
        css.push(result.href);
      }
    } else if (result.kind === "js") {
      if (!seenJs.has(result.href)) {
        seenJs.add(result.href);
        js.push(result.href);
      }
    }
  }

  return { css, js, errors };
}
