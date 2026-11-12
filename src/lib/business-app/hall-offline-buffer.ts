/**
 * t1331u / t1332u (Sergey 09.11.2026, widget t1332s9582): short technical buffer of the next hall
 * tracks, so a hall keeps playing through a short internet outage.
 *
 * Option A – NOT the multi-day offline mode of the agreement (2.1): no offline_storage_cache grant,
 * SPA_OFFLINE_ENABLED stays off, the service worker never sees audio. The hall device downloads
 * the next HALL_BUFFER_TRACKS queue tracks (fetch of the same short-lived signed URL the player
 * uses) into Cache Storage, IndexedDB where Cache Storage is missing, or nothing (streaming only,
 * as before: in-app WebViews, private windows, very small quotas).
 *
 * Every copy is usable only until the EARLIER of HALL_BUFFER_MAX_AGE_MS after its download and the
 * track's playable_until (the account access end, `workspaceItems`). Expired copies are deleted on
 * every start check and on a timer; a copy that expires while it sounds is reported through
 * `onExpired` (the player stops it / goes back to streaming). no_access / unpaired: `purge()`
 * deletes everything. The same <audio> element plays a blob: URL of the copy, so Media Session,
 * the lock screen, the iPhone loop handoff (#1196), the build reload (#1200) and the queue top-up
 * (#1201) are unchanged.
 */

import type { OnlineSignResult } from "./spa-online-player";

/** Sergey t1332s9582: «Делай запас из 10 треков». */
export const HALL_BUFFER_TRACKS = 10;
/** Soft cap on the bytes kept for the buffer (10 tracks are ~60 MB). */
export const HALL_BUFFER_SOFT_CAP_BYTES = 100 * 1024 * 1024;
/** A copy is a short technical reserve, never older than this. */
export const HALL_BUFFER_MAX_AGE_MS = 2 * 60 * 60_000;
/** Downloads at once: one, so the buffer never competes with the sounding stream. */
export const HALL_BUFFER_CONCURRENCY = 1;
/** Size assumed for a track before the first one is downloaded. */
export const HALL_BUFFER_ASSUMED_TRACK_BYTES = 8 * 1024 * 1024;
/** Free space always left to the browser / other site data. */
export const HALL_BUFFER_FREE_MARGIN_BYTES = 50 * 1024 * 1024;
/** After a failed download, the buffer tries again no sooner than this. */
export const HALL_BUFFER_RETRY_MS = 30_000;
/** Expiry check while nothing else happens. */
export const HALL_BUFFER_SWEEP_MS = 30_000;
/** Without a known length a copy has to stay usable at least this long to be started. */
export const HALL_BUFFER_DEFAULT_TRACK_MS = 5 * 60_000;
/** Cache Storage name (never "audiolad-pwa-*": public/sw.js deletes those on activate). */
export const HALL_BUFFER_CACHE_NAME = "audiolad-hall-buffer-v1";
export const HALL_BUFFER_IDB_STORAGE = "audiolad-hall-buffer";
/**
 * Copies held in memory as Blob objects (the sounding track and the next ones): the rest stays on
 * disk only, so a phone never keeps ~60 MB of audio in memory.
 */
export const HALL_BUFFER_WARM = 2;
/** localStorage: whose buffer this is (`space:location`). A different hall wipes it. */
export const HALL_BUFFER_OWNER_KEY = "audiolad.hall-buffer.owner";
/**
 * t1390u (Sergey 12.11.2026, hall iPhone): Safari re-opened the hall page by itself after 50–70
 * track changes (11.11 and 12.11 at 09:42 MSK), most likely because the page ran out of memory –
 * every boundary pushed a whole ~8 MB mp3 through the page (fetch → Blob → Cache Storage) next to
 * the stream. On iPhone / iPad the buffer now keeps only this many next tracks, streams each
 * download straight into Cache Storage (the body never becomes a Blob in the page), keeps no copy
 * in memory until a reconnect asks for one, and waits HALL_BUFFER_IOS_START_DELAY_MS after a track
 * starts before it downloads anything (one request at a time, never at the boundary).
 */
export const HALL_BUFFER_IOS_TRACKS = 3;
export const HALL_BUFFER_IOS_START_DELAY_MS = 45_000;

export type BufferStoreKind = "cache" | "idb";

export type BufferStore = {
  kind: BufferStoreKind;
  get(id: string): Promise<{ blob: Blob; downloadedAt: number } | null>;
  put(id: string, blob: Blob, downloadedAt: number): Promise<void>;
  /**
   * t1390u: store a network response without reading its body into the page (Cache Storage
   * streams it to disk). Resolves with the stored size in bytes. Missing: Blob path only.
   */
  putResponse?(id: string, response: Response, downloadedAt: number): Promise<number>;
  /** t1390u: size and download time without reading the body (rehydrate after a reload). */
  meta?(id: string, readBody?: boolean): Promise<{ size: number; downloadedAt: number } | null>;
  delete(id: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
};

export type BufferTrack = { audioItemId: string; durationSeconds: number | null };

export type HallBufferDeps = {
  /** null: this browser cannot keep tracks – streaming only, the buffer stays empty. */
  store: BufferStore | null;
  sign(audioItemId: string): Promise<OnlineSignResult>;
  fetchBlob(url: string, signal: AbortSignal): Promise<Blob>;
  /**
   * t1390u: raw response for `putResponse` (streamed download). Used only with `streamToStore`
   * and a store that has `putResponse`; any failure there falls back to nothing (retry later).
   */
  fetchResponse?(url: string, signal: AbortSignal): Promise<Response>;
  /** t1390u: download straight into the store (hall iPhone). Default false (Blob path). */
  streamToStore?: boolean;
  /**
   * t1390u: lazy copies (hall iPhone) – nothing is loaded into memory ahead of time; only a copy
   * asked for by `prepare(id)` (a reconnect) or already sounding is. Default false.
   */
  lazyCopies?: boolean;
  /** t1390u: after a new track starts (`pin`), no download begins for this long. Default 0. */
  startDelayMs?: number;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  /**
   * The track's current manifest window: null = not allowed any more (left the manifest);
   * `until` = playable_until in ms (account access end), null = no end known.
   */
  window(audioItemId: string): { until: number | null } | null;
  isOnline(): boolean;
  /** Free space hint (navigator.storage.estimate). Omitted / null: only the soft cap applies. */
  estimate?(): Promise<{ quota?: number; usage?: number } | null>;
  /** A copy that is no longer usable while it sounds (age / access end). */
  onExpired?(audioItemId: string): void;
  /** The server refused the account: the buffer has already purged itself. */
  onNoAccess?(): void;
  onChange?(): void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  maxTracks?: number;
  /**
   * t1365u: next tracks kept in memory as Blob objects (default HALL_BUFFER_WARM). The hall iPhone
   * keeps fewer: it starts from the stream and needs a copy in memory only for a reconnect.
   */
  warmTracks?: number;
  softCapBytes?: number;
  concurrency?: number;
};

/** `blob`: loaded from the store (warm) or null (on disk only). */
type Entry = { blob: Blob | null; size: number; downloadedAt: number; url: string | null };

/**
 * Next `n` distinct tracks the player will really play after `currentIndex`, following the same
 * `nextIndex` the controller uses (wrap included). The current track is not part of it.
 */
export function hallBufferPlan(
  tracks: readonly { audioItemId: string }[],
  currentIndex: number,
  nextIndex: (current: number, length: number) => number,
  n = HALL_BUFFER_TRACKS,
): string[] {
  const len = tracks.length;
  if (len === 0 || n <= 0) return [];
  const currentId = currentIndex >= 0 ? tracks[currentIndex]?.audioItemId ?? null : null;
  const out: string[] = [];
  const seen = new Set<string>(currentId ? [currentId] : []);
  let cur = currentIndex;
  for (let step = 0; step < len && out.length < n; step++) {
    const next = nextIndex(cur, len);
    if (!Number.isInteger(next) || next < 0 || next >= len) break;
    // Back at the current track: the queue loops, nothing new follows.
    if (next === currentIndex) break;
    cur = next;
    const id = tracks[next]?.audioItemId;
    if (!id) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export class HallOfflineBuffer {
  private entries = new Map<string, Entry>();
  /** Tracks the buffer should hold, in play order (the next tracks after the current one). */
  private plan: string[] = [];
  /** Track the element plays now: kept (and its blob: URL alive) until another one sounds. */
  private pinned: string | null = null;
  /**
   * Review #1 F1: track the controller has just selected (it is no longer "next" but not sounding
   * yet). Its copy must survive the plan rebuild that the selection itself triggers.
   */
  private selected: string | null = null;
  private downloading = new Map<string, AbortController>();
  private retryAt = 0;
  private sweepTimer: unknown = null;
  private disposed = false;
  private avgSize = HALL_BUFFER_ASSUMED_TRACK_BYTES;
  /** Bumped by purge(): downloads started before it never land. */
  private generation = 0;
  private wantsRefill = false;
  /** t1390u: tracks a reconnect asked for (lazy copies). */
  private demanded: string[] = [];
  /** t1390u: no download starts before this moment (a track has just started). */
  private holdUntil = 0;
  private holdTimer: unknown = null;

  constructor(private readonly d: HallBufferDeps) {}

  get supported(): boolean {
    return this.d.store !== null;
  }

  get storeKind(): BufferStoreKind | null {
    return this.d.store?.kind ?? null;
  }

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  private timer(fn: () => void, ms: number): unknown {
    return (this.d.setTimer ?? ((f, t) => setTimeout(f, t)))(fn, ms);
  }

  private cancel(t: unknown) {
    (this.d.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(t);
  }

  private get maxTracks(): number {
    return Math.max(0, this.d.maxTracks ?? HALL_BUFFER_TRACKS);
  }

  /** Last moment a copy may still sound (ms); -Infinity when the track is not allowed at all. */
  usableUntil(id: string, downloadedAt: number): number {
    const w = this.d.window(id);
    if (!w) return -Infinity;
    const age = downloadedAt + HALL_BUFFER_MAX_AGE_MS;
    return w.until === null ? age : Math.min(age, w.until);
  }

  private usable(id: string, e: Entry, minMs = 0): boolean {
    return this.usableUntil(id, e.downloadedAt) - this.now() > minMs;
  }

  /** Copies of the planned tracks that can be played now (what the owner line says). */
  get readyCount(): number {
    let n = 0;
    for (const id of this.plan) {
      const e = this.entries.get(id);
      if (e && this.usable(id, e)) n++;
    }
    return n;
  }

  has(id: string): boolean {
    const e = this.entries.get(id);
    return !!e && this.usable(id, e);
  }

  /**
   * blob: URL to start this track from the device copy, or null (stream it). The copy has to stay
   * usable for the whole track (`durationSec`, else HALL_BUFFER_DEFAULT_TRACK_MS); an expired one is
   * deleted here.
   */
  localSource(id: string, durationSec?: number | null): string | null {
    if (this.disposed) return null;
    const e = this.entries.get(id);
    if (!e) return null;
    if (!this.usable(id, e)) {
      this.evict(id);
      return null;
    }
    const need = typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec * 1000 : HALL_BUFFER_DEFAULT_TRACK_MS;
    if (!this.usable(id, e, need)) return null;
    if (!e.url) {
      if (!e.blob) {
        void this.warm();
        return null;
      }
      e.url = this.d.createUrl(e.blob);
    }
    return e.url;
  }

  /** Copies never evicted by a plan change: the sounding track and the selected one. */
  private kept(id: string): boolean {
    return id === this.pinned || id === this.selected;
  }

  /** Tracks whose copies are kept in memory: sounding, selected and the next HALL_BUFFER_WARM. */
  private warmIds(): string[] {
    if (this.d.lazyCopies) {
      // Hall iPhone: only what a reconnect asked for, and the copy the element already plays.
      const ids = this.demanded.filter((id) => this.entries.has(id));
      if (this.pinned && this.entries.get(this.pinned)?.url && !ids.includes(this.pinned)) ids.unshift(this.pinned);
      return ids;
    }
    const warm = Math.max(0, Math.floor(this.d.warmTracks ?? HALL_BUFFER_WARM));
    const ids = this.plan.slice(0, warm);
    for (const id of [this.selected, this.pinned]) if (id && !ids.includes(id)) ids.unshift(id);
    return ids;
  }

  /**
   * Loads the copies of the sounding / next tracks from the store into memory (works offline) and
   * drops the others from memory (they stay on disk). Never touches a blob: URL the element plays.
   */
  async warm(): Promise<void> {
    const store = this.d.store;
    if (!store || this.disposed) return;
    const want = this.warmIds();
    for (const [id, e] of this.entries) {
      if (want.includes(id) || this.kept(id)) continue;
      if (e.url) {
        this.d.revokeUrl(e.url);
        e.url = null;
      }
      e.blob = null;
    }
    const gen = this.generation;
    for (const id of want) {
      const e = this.entries.get(id);
      if (!e || e.blob) continue;
      let got: { blob: Blob; downloadedAt: number } | null = null;
      try {
        got = await store.get(id);
      } catch {
        got = null;
      }
      if (this.disposed || gen !== this.generation) return;
      const now = this.entries.get(id);
      if (!now) continue;
      if (!got) {
        // Gone from the store (browser eviction): forget it, the refill downloads it again.
        this.entries.delete(id);
        this.d.onChange?.();
        continue;
      }
      if (!now.blob) now.blob = got.blob;
    }
  }

  /**
   * t1390u: a reconnect of this track is coming – load its copy into memory (lazy copies only;
   * otherwise the copy is warm already). The controller's retry picks it up.
   */
  prepare(id: string): void {
    if (this.disposed || !this.d.lazyCopies || !this.entries.has(id)) return;
    // At most two copies in memory: the sounding track and the next one (a reconnect asks for both).
    if (!this.demanded.includes(id)) this.demanded = [...this.demanded, id].slice(-2);
    void this.warm();
  }

  /** t1390u telemetry: copies on the device, their bytes and how many sit in page memory. */
  stats(): { tracks: number; bytes: number; inMemory: number } {
    let inMemory = 0;
    for (const e of this.entries.values()) if (e.blob) inMemory++;
    return { tracks: this.entries.size, bytes: this.bytes(), inMemory };
  }

  /** The element now plays this track (null: nothing). The previous pinned copy may go. */
  pin(id: string | null): void {
    if (this.pinned === id) return;
    const old = this.pinned;
    this.pinned = id;
    // A reconnect that asked for a copy is over once another track sounds.
    if (id && !this.demanded.includes(id)) this.demanded = [];
    const delay = Math.max(0, this.d.startDelayMs ?? 0);
    if (id && delay > 0) this.hold(delay);
    if (old && !this.plan.includes(old) && !this.kept(old)) this.evict(old);
    void this.warm();
  }

  /**
   * The next tracks changed (advance, queue rebuild / top-up, manifest). Evicts the rest, except
   * the sounding track and `selectedId` – the one the controller is starting right now.
   */
  setPlan(ids: readonly string[], selectedId: string | null = null): void {
    if (this.disposed) return;
    const max = this.maxTracks;
    const next = [...new Set(ids)].filter((id) => id !== selectedId).slice(0, max);
    // t1390u: the controller starts another track (it pins it only after the source is set) –
    // the start delay begins now, before the refill that follows this plan change.
    const delay = Math.max(0, this.d.startDelayMs ?? 0);
    if (delay > 0 && selectedId && selectedId !== this.pinned && selectedId !== this.selected) this.hold(delay);
    this.selected = selectedId;
    this.plan = next;
    for (const [id, ctl] of this.downloading) {
      if (!next.includes(id)) {
        ctl.abort();
        this.downloading.delete(id);
      }
    }
    for (const id of [...this.entries.keys()]) {
      if (!this.kept(id) && !next.includes(id)) this.evict(id);
    }
    void this.warm();
    this.d.onChange?.();
  }

  /** t1390u: no download starts for `ms`; a refill wanted meanwhile runs when the hold ends. */
  private hold(ms: number): void {
    this.holdUntil = this.now() + ms;
    if (this.holdTimer !== null) this.cancel(this.holdTimer);
    this.holdTimer = this.timer(() => {
      this.holdTimer = null;
      if (!this.disposed && this.wantsRefill) void this.refill();
    }, ms);
  }

  /** Reload: take over the copies already on the device (expired / foreign ones are deleted). */
  async rehydrate(): Promise<void> {
    const store = this.d.store;
    if (!store || this.disposed) return;
    const gen = this.generation;
    let keys: string[] = [];
    try {
      keys = await store.keys();
    } catch {
      return;
    }
    for (const id of keys) {
      if (this.disposed || gen !== this.generation) return;
      if (this.entries.has(id)) continue;
      // t1390u: size and age from the headers where the store can – a reload never reads every
      // copy into the page (10 tracks were ~80 MB of page memory right after a crash reload).
      let got: { size: number; downloadedAt: number } | null = null;
      try {
        // iPhone (lazy copies): an old copy without a size is dropped, never read into the page.
        if (store.meta) got = await store.meta(id, !this.d.lazyCopies);
        else {
          const row = await store.get(id);
          got = row ? { size: row.blob.size, downloadedAt: row.downloadedAt } : null;
        }
      } catch {
        got = null;
      }
      // Review #1: purged / disposed while reading – never bring a copy back.
      if (this.disposed || gen !== this.generation) return;
      if (this.entries.has(id)) continue;
      if (!got || !(got.downloadedAt > 0) || this.usableUntil(id, got.downloadedAt) <= this.now()) {
        void store.delete(id).catch(() => {});
        continue;
      }
      // On disk only; warm() loads the ones about to play.
      this.entries.set(id, { blob: null, size: got.size, downloadedAt: got.downloadedAt, url: null });
    }
    this.updateAvg();
    await this.warm();
    this.d.onChange?.();
  }

  /** Deletes expired copies; reports one that expired while it sounds. Re-arms itself. */
  sweep(): void {
    if (this.disposed) return;
    if (this.sweepTimer !== null) this.cancel(this.sweepTimer);
    this.sweepTimer = null;
    let changed = false;
    let nearest = Infinity;
    for (const [id, e] of [...this.entries]) {
      const until = this.usableUntil(id, e.downloadedAt);
      if (until <= this.now()) {
        const sounding = id === this.pinned;
        this.evict(id);
        changed = true;
        if (sounding) this.d.onExpired?.(id);
      } else nearest = Math.min(nearest, until);
    }
    if (changed) this.d.onChange?.();
    const wait = Math.max(250, Math.min(HALL_BUFFER_SWEEP_MS, nearest - this.now()));
    this.sweepTimer = this.timer(() => {
      this.sweepTimer = null;
      this.sweep();
      if (this.wantsRefill) void this.refill();
    }, wait);
  }

  private updateAvg() {
    const sizes = [...this.entries.values()].map((e) => e.size).filter((s) => s > 0);
    if (sizes.length > 0) this.avgSize = Math.max(256 * 1024, sizes.reduce((a, b) => a + b, 0) / sizes.length);
  }

  private bytes(): number {
    let sum = 0;
    for (const e of this.entries.values()) sum += e.size;
    return sum;
  }

  /** Bytes the buffer may hold now: the soft cap, shrunk to the free space the browser reports. */
  private async budget(): Promise<number> {
    const cap = this.d.softCapBytes ?? HALL_BUFFER_SOFT_CAP_BYTES;
    if (!this.d.estimate) return cap;
    try {
      const est = await this.d.estimate();
      const quota = est?.quota;
      const usage = est?.usage;
      if (typeof quota !== "number" || !Number.isFinite(quota) || quota <= 0) return cap;
      const free = quota - (typeof usage === "number" && Number.isFinite(usage) ? usage : 0) - HALL_BUFFER_FREE_MARGIN_BYTES;
      return Math.max(0, Math.min(cap, this.bytes() + free));
    } catch {
      return cap;
    }
  }

  /**
   * Downloads missing planned tracks in play order while online, at most `concurrency` at once,
   * within the byte budget. `active`: only while the hall is meant to play (an idle hall left open
   * overnight must not download the same tracks every 2 hours).
   */
  async refill(active = true): Promise<void> {
    if (this.disposed || !this.d.store) return;
    this.wantsRefill = active;
    if (!active) return;
    this.sweep();
    if (!this.d.isOnline() || this.now() < this.retryAt) return;
    // t1390u: a track has just started – the boundary belongs to the stream (the hold timer refills).
    if (this.now() < this.holdUntil) return;
    // t1390u: an iPhone never downloads a whole mp3 into the page. Without a streaming store
    // (Cache Storage unavailable → IndexedDB) it plays the stream only, with no copies.
    if (this.d.streamToStore && !(this.d.fetchResponse && this.d.store.putResponse)) return;
    const limit = Math.max(1, this.d.concurrency ?? HALL_BUFFER_CONCURRENCY);
    if (this.downloading.size >= limit) return;
    const id = this.plan.find((x) => !this.downloading.has(x) && !this.has(x));
    if (!id) return;
    const budget = await this.budget();
    // The track may have changed while the budget was read (provider: plan → refill → pin).
    if (this.now() < this.holdUntil) return;
    if (this.disposed || this.downloading.has(id) || this.has(id) || !this.plan.includes(id)) return;
    if (this.downloading.size >= limit) return; // another refill started meanwhile
    if (this.bytes() + this.avgSize > budget) return; // N shrinks to what the device can hold
    const gen = this.generation;
    const abort = new AbortController();
    this.downloading.set(id, abort);
    try {
      const signed = await this.d.sign(id);
      if (!signed.ok) {
        if (signed.reason === "no_access") {
          await this.purge();
          this.d.onNoAccess?.();
          return;
        }
        throw new Error(signed.reason);
      }
      const store = this.d.store;
      let blob: Blob | null = null;
      let size = 0;
      let downloadedAt = 0;
      if (this.d.streamToStore && this.d.fetchResponse && store.putResponse) {
        // t1390u: the body goes from the network straight to Cache Storage, never into the page.
        const response = await this.d.fetchResponse(signed.data.url, abort.signal);
        if (this.disposed || gen !== this.generation || abort.signal.aborted) return;
        if (!response.ok) throw new Error(`http_${response.status}`);
        if (!this.d.window(id) || !this.plan.includes(id)) {
          try { await response.body?.cancel(); } catch { /* nothing to release */ }
          return;
        }
        downloadedAt = this.now();
        size = await store.putResponse(id, response, downloadedAt);
      } else {
        const fetched = await this.d.fetchBlob(signed.data.url, abort.signal);
        if (this.disposed || gen !== this.generation || abort.signal.aborted) return;
        if (!this.d.window(id) || !this.plan.includes(id)) return;
        blob = fetched.type ? fetched : new Blob([fetched], { type: "audio/mpeg" });
        downloadedAt = this.now();
        await store.put(id, blob, downloadedAt);
        size = blob.size;
      }
      if (this.disposed || gen !== this.generation) {
        void store.delete(id).catch(() => {});
        return;
      }
      const old = this.entries.get(id);
      if (old?.url && id !== this.pinned) this.d.revokeUrl(old.url);
      // Kept in memory only when it plays soon; otherwise on disk until warm() needs it.
      const warmNow = !!blob && this.warmIds().includes(id);
      this.entries.set(id, {
        blob: warmNow ? blob : null,
        size,
        downloadedAt,
        url: id === this.pinned ? old?.url ?? null : null,
      });
      // Streamed (Android): a copy that should be warm is read back from disk now.
      const warmLater = !warmNow && !blob && this.warmIds().includes(id);
      blob = null;
      if (warmLater) void this.warm();
      this.updateAvg();
      this.retryAt = 0;
      this.d.onChange?.();
    } catch {
      if (!abort.signal.aborted) this.retryAt = this.now() + HALL_BUFFER_RETRY_MS;
      return;
    } finally {
      if (this.downloading.get(id) === abort) this.downloading.delete(id);
    }
    void this.refill(active);
  }

  private evict(id: string): void {
    const e = this.entries.get(id);
    this.entries.delete(id);
    if (e?.url) this.d.revokeUrl(e.url);
    void this.d.store?.delete(id).catch(() => {});
  }

  /** no_access, unpaired, another hall: every copy goes now. */
  async purge(): Promise<void> {
    this.generation++;
    for (const ctl of this.downloading.values()) ctl.abort();
    this.downloading.clear();
    for (const e of this.entries.values()) if (e.url) this.d.revokeUrl(e.url);
    this.entries.clear();
    this.plan = [];
    try {
      await this.d.store?.clear();
    } catch { /* best effort */ }
    this.d.onChange?.();
  }

  /** Page / player gone: blob: URLs released, copies stay for the reload (rehydrate). */
  dispose(): void {
    this.disposed = true;
    if (this.sweepTimer !== null) this.cancel(this.sweepTimer);
    this.sweepTimer = null;
    if (this.holdTimer !== null) this.cancel(this.holdTimer);
    this.holdTimer = null;
    for (const ctl of this.downloading.values()) ctl.abort();
    this.downloading.clear();
    for (const e of this.entries.values()) if (e.url) this.d.revokeUrl(e.url);
    this.entries.clear();
  }
}
