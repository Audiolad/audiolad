/**
 * Canonical client IP for Audiolad analytics rate limits.
 *
 * Proven production path (live DNS + HTTPS + repo; live vhost is NOT in git):
 *   browser → Timeweb origin nginx → Next.js 127.0.0.1:3000
 * Cloudflare is not in front of audiolad.ru (A/AAAA are Timeweb, TLS is
 * nginx/1.24.0, no cf-ray / CF-Connecting-IP / server: cloudflare).
 *
 * Repo upload snippets set:
 *   X-Real-IP $remote_addr
 *   X-Forwarded-For $proxy_add_x_forwarded_for
 * Default /api/analytics location headers are not proven in git.
 *
 * Canonical IP is nginx $remote_addr (TCP peer):
 *   1. X-Real-IP when present and a valid IP
 *   2. else the RIGHTMOST X-Forwarded-For hop (the hop nginx appends)
 *   3. else unknown
 *
 * Never use the leftmost XFF hop — that is client-spoofable.
 * Do not trust Cloudflare ranges or CF-Connecting-IP: that would make
 * spoofing easier on this origin-nginx topology.
 */

export function parseForwardedFor(value: string | null | undefined): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => isValidIp(part));
}

export function mappedIpv4(ip: string): string | null {
  const match = ip.trim().toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (!match || !isIpv4(match[1])) {
    return null;
  }
  return match[1];
}

export function isValidIp(value: string): boolean {
  const trimmed = value.trim();
  return isIpv4(trimmed) || Boolean(mappedIpv4(trimmed)) || isIpv6(trimmed);
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || value.split("::").length > 2) {
    return false;
  }

  const groups = value.split(":");
  if (groups.length < 3 || groups.length > 8) {
    return false;
  }

  return groups.every((group) => group === "" || /^[0-9a-f]{1,4}$/i.test(group));
}

/**
 * TCP peer as seen by nginx: X-Real-IP ($remote_addr), else last XFF hop.
 */
export function getTrustedClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  const hops = parseForwardedFor(request.headers.get("x-forwarded-for"));
  const rightmost = hops.at(-1);
  if (rightmost) {
    return rightmost;
  }

  return "unknown";
}

/** Storm diagnosis connecting client (Cloudflare WARP/egress), not origin edge. */
export const STORM_CLIENT_IP_EXAMPLE = "104.30.175.37";
