import "server-only";

import { readFile, stat } from "node:fs/promises";
import { isIP } from "node:net";

import { Reader } from "mmdb-lib";

import { businessGeoFromRecord, type BusinessGeo } from "./geo";

/**
 * In-process DB-IP Lite City lookup. The database is downloaded on the server by
 * scripts/business-geoip-refresh.sh (never committed). A missing or broken file means
 * «no city», never an error. The file is re-read when its mtime changes (checked at most
 * every 10 minutes), so the monthly refresh needs no restart.
 */

const RECHECK_MS = 10 * 60 * 1000;

type Loaded = { path: string; mtimeMs: number; reader: Reader<Record<string, unknown>> | null };

let loaded: Loaded | null = null;
let checkedAt = 0;
let pending: Promise<Loaded | null> | null = null;

async function load(path: string): Promise<Loaded | null> {
  try {
    const info = await stat(path);
    if (loaded && loaded.path === path && loaded.mtimeMs === info.mtimeMs) return loaded;
    const reader = new Reader<Record<string, unknown>>(await readFile(path));
    if (!/city/i.test(String(reader.metadata.databaseType))) return { path, mtimeMs: info.mtimeMs, reader: null };
    return { path, mtimeMs: info.mtimeMs, reader };
  } catch {
    return null;
  }
}

async function readerFor(path: string): Promise<Reader<Record<string, unknown>> | null> {
  const now = Date.now();
  if (loaded?.path === path && now - checkedAt < RECHECK_MS) return loaded.reader;
  if (!pending) {
    pending = load(path).then((value) => {
      loaded = value;
      checkedAt = Date.now();
      return value;
    }).finally(() => {
      pending = null;
    });
  }
  return (await pending)?.reader ?? null;
}

export async function lookupBusinessGeo(ip: string | null | undefined, path: string | null): Promise<BusinessGeo | null> {
  const address = typeof ip === "string" ? ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "") : "";
  if (!path || !address || isIP(address) === 0) return null;
  try {
    const reader = await readerFor(path);
    return reader ? businessGeoFromRecord(reader.get(address)) : null;
  } catch {
    return null;
  }
}
