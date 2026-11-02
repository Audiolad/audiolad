import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** IPv6 addresses share one quota per /64. Nothing persists the raw address. */
export function normalizedGuestNetwork(ip: string): string | null {
  const value = ip.trim().toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped && isIP(mapped) === 4) return mapped;
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes("%")) return null;
  // URL canonicalization also handles IPv4 embedded in IPv6.
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const a = left ? left.split(":") : [];
  const b = right ? right.split(":") : [];
  const words = right === undefined ? a : [...a, ...Array<string>(8 - a.length - b.length).fill("0"), ...b];
  // Treat canonical IPv4-mapped IPv6 as IPv4 too.
  if (words.slice(0, 5).every((word) => parseInt(word, 16) === 0) && parseInt(words[5], 16) === 65535) {
    const hi = parseInt(words[6], 16), lo = parseInt(words[7], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${words.slice(0, 4).map((word) => parseInt(word, 16).toString(16).padStart(4, "0")).join(":")}::/64`;
}

export function guestNetworkKey(ip: string, secret: string): string | null {
  if (new TextEncoder().encode(secret).byteLength < 32) return null;
  const network = normalizedGuestNetwork(ip);
  return network ? createHmac("sha256", secret).update(`audiolad:business-guest-start:network:v1\0${network}`).digest("hex") : null;
}
