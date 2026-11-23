import "server-only";

import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { lookupBusinessGeo } from "@/lib/business-trial-attribution/geo.server";

/**
 * Country of the visitor, from the DB-IP Lite City file already on the server
 * (AUDIOLAD_GEOIP_CITY_DB). The MMDB reader is kept in process by lookupBusinessGeo;
 * this layer also caches IP → country so a busy page does not repeat the lookup.
 * Missing file, private IP or a failed lookup → null (no notice).
 */

const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 2000;

type Entry = { country: string | null; at: number };

const cache = new Map<string, Entry>();

function geoDbPath(): string | null {
  const path = process.env.AUDIOLAD_GEOIP_CITY_DB?.trim();
  return path && path.startsWith("/") ? path : null;
}

function readCache(ip: string, now: number): string | null | undefined {
  const entry = cache.get(ip);
  if (!entry) return undefined;
  if (now - entry.at >= CACHE_MS) {
    cache.delete(ip);
    return undefined;
  }
  cache.delete(ip);
  cache.set(ip, entry);
  return entry.country;
}

function writeCache(ip: string, country: string | null, now: number): void {
  if (cache.size >= CACHE_MAX) {
    const stale = now - CACHE_MS;
    for (const [key, entry] of cache) {
      if (entry.at < stale) cache.delete(key);
    }
    if (cache.size >= CACHE_MAX) {
      const excess = cache.size - Math.floor(CACHE_MAX / 2);
      let dropped = 0;
      for (const key of cache.keys()) {
        cache.delete(key);
        dropped += 1;
        if (dropped >= excess) break;
      }
    }
  }
  cache.set(ip, { country, at: now });
}

export async function lookupVpnNoticeCountry(headerStore: Headers): Promise<string | null> {
  const path = geoDbPath();
  if (!path) return null;
  const ip = getTrustedClientIp(new Request("https://audiolad.ru/", { headers: headerStore }));
  if (!ip || ip === "unknown") return null;
  const now = Date.now();
  const cached = readCache(ip, now);
  if (cached !== undefined) return cached;
  const geo = await lookupBusinessGeo(ip, path);
  const country = geo?.country && /^[A-Z]{2}$/.test(geo.country) ? geo.country : null;
  writeCache(ip, country, now);
  return country;
}
