/**
 * Trusted-proxy client IP for rate limits.
 *
 * Production path from repo configs (live site file is NOT in git):
 *   browser → (Cloudflare, if enabled) → nginx → Next.js 127.0.0.1:3000
 * Repo nginx snippets set:
 *   X-Real-IP $remote_addr
 *   X-Forwarded-For $proxy_add_x_forwarded_for
 * so X-Real-IP is the immediate peer of nginx (Cloudflare edge or the client).
 *
 * Do not use a Cloudflare/proxy peer as the client cap.
 * Do not trust a client-supplied X-Forwarded-For when the peer is not a
 * trusted proxy.
 */

const CLOUDFLARE_IPV4_CIDRS = [
  // Official published proxy anycast list: https://www.cloudflare.com/ips-v4
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  // ARIN CLOUDFLARENET allocation 104.16.0.0/12 (104.16.0.0–104.31.255.255).
  // Official proxy list is a subset; 104.30.175.37 is in this allocation and
  // must not be treated as a visitor IP.
  "104.16.0.0/12",
] as const;

const CLOUDFLARE_IPV6_CIDRS = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

const LOOPBACK_IPV4_CIDRS = ["127.0.0.0/8"] as const;

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
  return isIpv4(value) || Boolean(mappedIpv4(value)) || isIpv6(value);
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
  if (!value.includes(":")) {
    return false;
  }

  try {
    // Node accepts IPv6 here; reject IPv4-mapped junk that is not a real IP.
    return Boolean(expandIpv6(value));
  } catch {
    return false;
  }
}

function ipv4ToInt(ip: string): number | null {
  if (!isIpv4(ip)) {
    return null;
  }

  const [a, b, c, d] = ip.split(".").map(Number);
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const bits = Number(bitsRaw);

  if (ipInt == null || baseInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }

  if (bits === 0) {
    return true;
  }

  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function expandIpv6(ip: string): number[] | null {
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed.includes(":")) {
    return null;
  }

  const [head, tail] = trimmed.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];

  if (trimmed.includes("::")) {
    if (headParts.filter(Boolean).length + tailParts.filter(Boolean).length > 7) {
      return null;
    }
  } else if (headParts.length !== 8) {
    return null;
  }

  const missing = 8 - (headParts.filter((p) => p !== "").length + tailParts.filter((p) => p !== "").length);
  const parts = [
    ...headParts.filter((p) => p !== ""),
    ...Array.from({ length: Math.max(missing, 0) }, () => "0"),
    ...tailParts.filter((p) => p !== ""),
  ];

  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  return parts.map((part) => Number.parseInt(part, 16));
}

function ipv6InCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const ipParts = expandIpv6(ip);
  const baseParts = expandIpv6(base);
  const bits = Number(bitsRaw);

  if (!ipParts || !baseParts || !Number.isInteger(bits) || bits < 0 || bits > 128) {
    return false;
  }

  let remaining = bits;
  for (let i = 0; i < 8 && remaining > 0; i += 1) {
    const take = Math.min(16, remaining);
    const mask = take === 16 ? 0xffff : (~((1 << (16 - take)) - 1)) & 0xffff;
    if ((ipParts[i] & mask) !== (baseParts[i] & mask)) {
      return false;
    }
    remaining -= take;
  }

  return true;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  if (cidr.includes(".") && isIpv4(ip)) {
    return ipv4InCidr(ip, cidr);
  }
  if (cidr.includes(":") && ip.includes(":")) {
    return ipv6InCidr(ip, cidr);
  }
  return false;
}

export function isCloudflareIp(ip: string): boolean {
  const v4 = mappedIpv4(ip) ?? (isIpv4(ip) ? ip : null);
  if (v4) {
    return CLOUDFLARE_IPV4_CIDRS.some((cidr) => ipv4InCidr(v4, cidr));
  }
  if (isIpv6(ip)) {
    return CLOUDFLARE_IPV6_CIDRS.some((cidr) => ipv6InCidr(ip, cidr));
  }
  return false;
}

export function isTrustedProxyIp(ip: string): boolean {
  if (LOOPBACK_IPV4_CIDRS.some((cidr) => ipInCidr(ip, cidr)) || ip === "::1") {
    return true;
  }

  return isCloudflareIp(ip);
}

export const STORM_EDGE_IP_EXAMPLE = "104.30.175.37";

/**
 * Immediate peer as seen by nginx (`X-Real-IP $remote_addr`).
 * Do not treat the last X-Forwarded-For hop as the peer: a direct client
 * can append a Cloudflare address and would otherwise look like a proxy.
 */
export function getImmediatePeerIp(request: Request): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim() ?? null;
  return realIp && isValidIp(realIp) ? realIp : null;
}

function clientFromTrustedChain(
  request: Request,
  forwarded: string[],
): string {
  const cfConnecting = request.headers.get("cf-connecting-ip")?.trim() ?? null;
  if (cfConnecting && isValidIp(cfConnecting) && !isTrustedProxyIp(cfConnecting)) {
    return cfConnecting;
  }

  for (let i = forwarded.length - 1; i >= 0; i -= 1) {
    const hop = forwarded[i];
    if (!isTrustedProxyIp(hop)) {
      return hop;
    }
  }

  return "unknown";
}

export function getTrustedClientIp(request: Request): string {
  const forwarded = parseForwardedFor(request.headers.get("x-forwarded-for"));
  const peer = getImmediatePeerIp(request);
  const cfConnecting = request.headers.get("cf-connecting-ip")?.trim() ?? null;
  const cfRay = request.headers.get("cf-ray")?.trim() ?? null;

  if (peer && isTrustedProxyIp(peer)) {
    return clientFromTrustedChain(request, forwarded);
  }

  if (peer) {
    return peer;
  }

  // Live default nginx location is not in git. CF headers may still be
  // passed through to Next.js. Never accept a proxy address as the client.
  if (cfConnecting && cfRay && isValidIp(cfConnecting) && !isTrustedProxyIp(cfConnecting)) {
    return cfConnecting;
  }

  return "unknown";
}
