/** Canonical production origin for SEO URLs. */
export const PRODUCTION_APP_ORIGIN = "https://audiolad.ru";

const PUBLIC_REQUEST_HOSTS = new Set([
  "audiolad.ru",
  "www.audiolad.ru",
  "school.audiolad.ru",
  "localhost",
  "127.0.0.1",
]);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Public site origin for metadata, canonical URLs, and sitemap.
 * Does not read request headers — only env with a safe production fallback.
 */
export function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return PRODUCTION_APP_ORIGIN;
}

export function getAppOriginUrl(): URL {
  return new URL(`${getAppOrigin()}/`);
}

function firstHeaderValue(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const first = raw.split(",")[0]?.trim();
  return first || null;
}

function parseHostHeader(raw: string): { hostname: string; port: string | null } {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { hostname: "", port: null };
  }

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end === -1) {
      return { hostname: "", port: null };
    }

    const hostname = trimmed.slice(1, end).toLowerCase();
    const rest = trimmed.slice(end + 1);
    const port = rest.startsWith(":") ? rest.slice(1) : null;
    return { hostname, port };
  }

  const colon = trimmed.lastIndexOf(":");
  if (colon > -1 && /^\d+$/.test(trimmed.slice(colon + 1))) {
    return {
      hostname: trimmed.slice(0, colon).toLowerCase(),
      port: trimmed.slice(colon + 1),
    };
  }

  return { hostname: trimmed.toLowerCase(), port: null };
}

function normalizeForwardedProto(raw: string | null): "http" | "https" | null {
  const first = firstHeaderValue(raw)?.toLowerCase();
  if (first === "http" || first === "https") {
    return first;
  }
  return null;
}

function isAllowedPublicHost(hostname: string): boolean {
  return PUBLIC_REQUEST_HOSTS.has(hostname);
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

function listenProtocol(request: Request): "http" | "https" | null {
  try {
    const proto = new URL(request.url).protocol.replace(":", "");
    if (proto === "http" || proto === "https") {
      return proto;
    }
  } catch {
    // ignore malformed request.url
  }
  return null;
}

/**
 * Client proto for an allowlisted host.
 *
 * Next 16 fills x-forwarded-proto=http from the unencrypted loopback socket
 * when nginx omitted X-Forwarded-Proto $scheme (base-server.js ??= hop proto).
 * That hop proto is not the browser proto. Trust https as a real TLS signal.
 * For a public host, hop-http that matches the listen URL stays https.
 * Loopback keeps http so local next dev still works.
 */
function resolveClientProtocol(
  hostname: string,
  forwardedProto: "http" | "https" | null,
  request: Request,
): "http" | "https" {
  if (forwardedProto === "https") {
    return "https";
  }

  if (isLoopbackHost(hostname)) {
    return forwardedProto ?? "http";
  }

  const listen = listenProtocol(request);
  if (forwardedProto === "http" && listen === "http") {
    return "https";
  }

  return forwardedProto ?? "https";
}

function originFromHostAndProto(
  hostname: string,
  port: string | null,
  proto: "http" | "https",
): string {
  const defaultPort = proto === "https" ? "443" : "80";
  if (port && port !== defaultPort) {
    return `${proto}://${hostname}:${port}`;
  }
  return `${proto}://${hostname}`;
}

/**
 * Public origin for Route Handler redirects.
 *
 * Next on loopback sees request.url as http://localhost:3000. Using that
 * origin in Location sends browsers to localhost. Prefer allowlisted
 * forwarded/public Host, then local-dev request.url, then getAppOrigin().
 * Arbitrary forwarded hosts are rejected (no open redirect).
 */
export function getPublicRequestOrigin(request: Request): string {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = normalizeForwardedProto(
    request.headers.get("x-forwarded-proto"),
  );

  if (forwardedHost) {
    const { hostname, port } = parseHostHeader(forwardedHost);
    if (isAllowedPublicHost(hostname)) {
      return originFromHostAndProto(
        hostname,
        port,
        resolveClientProtocol(hostname, forwardedProto, request),
      );
    }
  }

  const host = firstHeaderValue(request.headers.get("host"));
  if (host) {
    const { hostname, port } = parseHostHeader(host);
    if (isAllowedPublicHost(hostname) && !isLoopbackHost(hostname)) {
      return originFromHostAndProto(
        hostname,
        port,
        resolveClientProtocol(hostname, forwardedProto, request),
      );
    }
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    const hostname = new URL(requestOrigin).hostname.toLowerCase();
    if (isLoopbackHost(hostname) && process.env.NODE_ENV !== "production") {
      return requestOrigin.replace(/\/$/, "");
    }
    if (isAllowedPublicHost(hostname) && !isLoopbackHost(hostname)) {
      return requestOrigin.replace(/\/$/, "");
    }
  } catch {
    // ignore malformed request.url
  }

  return getAppOrigin();
}

export function buildPublicRedirectUrl(path: string, request: Request): URL {
  return new URL(path, `${getPublicRequestOrigin(request)}/`);
}
