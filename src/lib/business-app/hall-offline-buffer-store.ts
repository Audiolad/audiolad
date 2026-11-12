/**
 * Browser storage for the hall buffer (hall-offline-buffer.ts): Cache Storage first (same pattern as
 * SpaPilotPlayer), IndexedDB blobs where Cache Storage is missing or refuses, otherwise null –
 * streaming only (in-app WebViews, private windows, blocked storage). Each candidate is probed with
 * a tiny write, because several browsers expose the API and then throw on use.
 */

import { HALL_BUFFER_CACHE_NAME, HALL_BUFFER_IDB_STORAGE, HALL_BUFFER_OWNER_KEY, type BufferStore } from "./hall-offline-buffer";

const cacheKey = (id: string) => `/__hall-buffer/${encodeURIComponent(id)}`;
const PROBE_KEY = "__probe__";
/** t1390u: size of a streamed copy whose response had no Content-Length (tiny sidecar entry). */
const sizeKey = (id: string) => `${cacheKey(id)}?size`;
const IDB_TABLE = "tracks";

function cacheStore(): BufferStore {
  const open = () => caches.open(HALL_BUFFER_CACHE_NAME);
  return {
    kind: "cache",
    async get(id) {
      const res = await (await open()).match(cacheKey(id));
      if (!res) return null;
      return { blob: await res.blob(), downloadedAt: Number(res.headers.get("x-hall-downloaded-at")) || 0 };
    },
    async put(id, blob, downloadedAt) {
      await (await open()).put(cacheKey(id), new Response(blob, {
        headers: {
          "content-type": blob.type || "audio/mpeg",
          "x-hall-downloaded-at": String(downloadedAt),
          "x-hall-size": String(blob.size),
        },
      }));
    },
    // t1390u: the response body streams into the cache – the page never holds the whole track.
    async putResponse(id, response, downloadedAt) {
      if (!response.body) throw new Error("no_body");
      const declared = Number(response.headers.get("content-length"));
      const headers: Record<string, string> = {
        "content-type": response.headers.get("content-type") || "audio/mpeg",
        "x-hall-downloaded-at": String(downloadedAt),
      };
      if (Number.isFinite(declared) && declared > 0) headers["x-hall-size"] = String(declared);
      const cache = await open();
      if (Number.isFinite(declared) && declared > 0) {
        await cache.put(cacheKey(id), new Response(response.body, { headers }));
        return declared;
      }
      // No length from the server (review 2): count the bytes as they pass – chunk by chunk, never
      // the whole track – and keep the size in a tiny sidecar entry for meta().
      let size = 0;
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctl) {
          size += chunk.byteLength;
          ctl.enqueue(chunk);
        },
      });
      await cache.put(cacheKey(id), new Response(response.body.pipeThrough(counter), { headers }));
      await cache.put(sizeKey(id), new Response(String(size), { headers: { "content-type": "text/plain" } }));
      return size;
    },
    async meta(id, readBody = true) {
      const cache = await open();
      const res = await cache.match(cacheKey(id));
      if (!res) return null;
      const downloadedAt = Number(res.headers.get("x-hall-downloaded-at")) || 0;
      let size = Number(res.headers.get("x-hall-size") || res.headers.get("content-length"));
      if (!(Number.isFinite(size) && size > 0)) {
        const side = await cache.match(sizeKey(id));
        size = side ? Number(await side.text()) : 0;
      }
      if (Number.isFinite(size) && size > 0) {
        res.body?.cancel().catch(() => { /* nothing to release */ }); // never wait on it
        return { size, downloadedAt };
      }
      // Copies stored before t1390u carry no size. iPhone (readBody false): never read a whole
      // track into the page – the copy is dropped and downloaded again. Others: read once.
      if (!readBody) {
        res.body?.cancel().catch(() => { /* nothing to release */ }); // never wait on it
        return null;
      }
      return { size: (await res.blob()).size, downloadedAt };
    },
    async delete(id) {
      const cache = await open();
      await cache.delete(cacheKey(id));
      await cache.delete(sizeKey(id));
    },
    async keys() {
      return (await (await open()).keys())
        .filter((r) => new URL(r.url).search === "")
        .map((r) => decodeURIComponent(new URL(r.url).pathname.split("/").pop() ?? ""))
        .filter((id) => id && id !== PROBE_KEY);
    },
    async clear() {
      await caches.delete(HALL_BUFFER_CACHE_NAME);
    },
  };
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HALL_BUFFER_IDB_STORAGE, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_TABLE)) req.result.createObjectStore(IDB_TABLE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("idb_blocked"));
  });
}

function idbStore(): BufferStore {
  let db: Promise<IDBDatabase> | null = null;
  const tx = async (mode: IDBTransactionMode) => {
    db ??= idbOpen();
    return (await db).transaction(IDB_TABLE, mode).objectStore(IDB_TABLE);
  };
  return {
    kind: "idb",
    async get(id) {
      const row = await idbRequest((await tx("readonly")).get(id)) as { blob?: unknown; downloadedAt?: unknown } | undefined;
      if (!row || !(row.blob instanceof Blob)) return null;
      return { blob: row.blob, downloadedAt: Number(row.downloadedAt) || 0 };
    },
    async put(id, blob, downloadedAt) {
      await idbRequest((await tx("readwrite")).put({ blob, downloadedAt }, id));
    },
    async delete(id) {
      await idbRequest((await tx("readwrite")).delete(id));
    },
    async keys() {
      return (await idbRequest((await tx("readonly")).getAllKeys())).map(String).filter((id) => id !== PROBE_KEY);
    },
    async clear() {
      await idbRequest((await tx("readwrite")).clear());
    },
  };
}

async function probe(store: BufferStore): Promise<boolean> {
  try {
    await store.put(PROBE_KEY, new Blob(["x"], { type: "audio/mpeg" }), 1);
    const got = await store.get(PROBE_KEY);
    await store.delete(PROBE_KEY);
    return !!got && got.blob.size === 1;
  } catch {
    return false;
  }
}

/** The first storage that really works here, or null (stream only). Never throws. */
export async function createHallBufferStore(): Promise<BufferStore | null> {
  try {
    if (typeof window === "undefined" || window.isSecureContext === false) return null;
    if (typeof caches !== "undefined") {
      const store = cacheStore();
      if (await probe(store)) return store;
    }
    if (typeof indexedDB !== "undefined") {
      const store = idbStore();
      if (await probe(store)) return store;
    }
  } catch { /* storage blocked */ }
  return null;
}

/** Owner of the copies on this device (`space:location`); null when none recorded. */
export function readHallBufferOwner(): string | null {
  try {
    return window.localStorage.getItem(HALL_BUFFER_OWNER_KEY);
  } catch {
    return null;
  }
}

export function writeHallBufferOwner(owner: string | null): void {
  try {
    if (owner) window.localStorage.setItem(HALL_BUFFER_OWNER_KEY, owner);
    else window.localStorage.removeItem(HALL_BUFFER_OWNER_KEY);
  } catch { /* private mode */ }
}

/**
 * Deletes every hall copy on this device without a buffer instance: this browser is no longer a
 * hall device (unpaired / signed out), or belongs to another hall now. Never throws.
 */
export async function purgeHallBufferStorage(): Promise<void> {
  writeHallBufferOwner(null);
  try {
    if (typeof caches !== "undefined") await caches.delete(HALL_BUFFER_CACHE_NAME);
  } catch { /* blocked */ }
  try {
    if (typeof indexedDB !== "undefined") {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(HALL_BUFFER_IDB_STORAGE);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    }
  } catch { /* blocked */ }
}
