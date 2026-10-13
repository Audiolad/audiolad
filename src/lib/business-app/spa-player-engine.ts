/**
 * Business SPA pilot (0e05333f): player engine, DOM-free and dependency-injected so
 * every rights/cache/transition rule is unit-tested with fake audio + fake clock.
 *
 * Rules (review 2026-10-13):
 *  - canStartTrack + manifest expiry are re-checked right before EVERY play()
 *    (first start, prepared next track, resume after pause) and on every tick for the
 *    current track; an expired track is stopped, its blob revoked and its cache dropped.
 *  - transitions are scheduled from the media clock: when the current track is within
 *    LOOKAHEAD of its end, the next (already buffered: readyState >= HAVE_ENOUGH_DATA)
 *    element is started exactly at the computed end time — not after `ended`.
 *  - a refresh that removes the current/prepared track stops and clears that source
 *    even when paused; an empty program stops playback; `no_access` stops everything and
 *    wipes cache, resume point and queued manifest data.
 *  - offline downloads are authorized separately (purpose "offline") and re-checked
 *    against the latest manifest + deadline right before cache.put; stale downloads
 *    (older generation) are discarded.
 *  - when the network drops, active and prepared stream sources switch to valid cached
 *    copies, keeping the position (checklist item 4).
 */

import {
  canStartTrack,
  manifestNeedsRefresh,
  offlineCacheDeadline,
  parseSpaManifest,
  type SpaManifest,
  type SpaManifestItem,
} from "./spa-manifest";
import {
  enqueueLog,
  nextIndex,
  parseLogQueue,
  parseResume,
  resolveResume,
  ackLog,
  type SpaLogEvent,
} from "./spa-player-core";

export const HAVE_ENOUGH_DATA = 4;
export const SPA_TRANSITION_LOOKAHEAD_MS = 1500;
export const SPA_TICK_MS = 250;

export type Result<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface AudioLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly readyState: number;
  volume: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, fn: () => void, opts?: { once?: boolean }): void;
  removeEventListener(type: string, fn: () => void): void;
}

export type CachedCopy = { data: Blob; cachedAt: number };

export interface EngineDeps {
  audios: [AudioLike, AudioLike];
  now(): number;
  online(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  sign(audioItemId: string, purpose: "stream" | "offline"): Promise<Result<{ url: string; offlineCacheUntil: string | null }>>;
  fetchManifest(): Promise<Result<unknown>>;
  sync(events: SpaLogEvent[]): Promise<Result<string[]>>;
  download(url: string): Promise<Blob | null>;
  cache: {
    get(id: string): Promise<CachedCopy | null>;
    put(id: string, data: Blob, cachedAt: number): Promise<void>;
    delete(id: string): Promise<void>;
    keys(): Promise<string[]>;
    clear(): Promise<void>;
  };
  objectUrl: { create(b: Blob): string; revoke(u: string): void };
  storage: { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void };
  uuid(): string;
  onChange(): void;
  programId: string;
  playerId: string | null;
  zoneId: string | null;
}

type Loaded = { audioItemId: string; kind: "blob" | "stream"; url: string; ready: boolean };
type Segment = { audioItemId: string; startedAt: number; playedMs: number; offline: boolean };

export type EngineStatus = "idle" | "playing" | "paused" | "needs_gesture" | "no_access" | "empty" | "refresh_required" | "error";

export class SpaPlayerEngine {
  manifest: SpaManifest | null = null;
  index = -1;
  status: EngineStatus = "idle";
  message: string | null = null;
  cachedAt = new Map<string, number>();

  private active = 0;
  private loaded: [Loaded | null, Loaded | null] = [null, null];
  private segment: Segment | null = null;
  private lastTime = 0;
  private tickTimer: unknown = null;
  private transitionTimer: unknown = null;
  private generation = 0;
  private order: string[] = [];
  private wasOnline = true;
  private readonly d: EngineDeps;

  constructor(deps: EngineDeps) {
    this.d = deps;
    this.wasOnline = deps.online();
    deps.audios.forEach((el, slot) => {
      el.addEventListener("ended", () => void this.onEnded(slot));
      el.addEventListener("timeupdate", () => this.accumulate(slot));
    });
  }

  get resumeKey() {
    return `business-spa-resume:${this.d.programId}`;
  }
  get logKey() {
    return `business-spa-log:${this.d.programId}`;
  }
  get orderKey() {
    return `business-spa-order:${this.d.programId}`;
  }
  get items(): SpaManifestItem[] {
    return this.manifest?.items ?? [];
  }
  get current(): SpaManifestItem | null {
    return this.index >= 0 ? this.items[this.index] ?? null : null;
  }
  activeEl(): AudioLike {
    return this.d.audios[this.active];
  }
  loadedActive(): Loaded | null {
    return this.loaded[this.active];
  }

  // ---------------- lifecycle ----------------
  async init(rawManifest: unknown): Promise<void> {
    this.setManifest(rawManifest);
    if (!this.manifest) return this.emit();
    await this.scanCache();
    const prevOrder = safeJson<string[]>(this.d.storage.get(this.orderKey)) ?? [];
    const r = resolveResume(this.items, parseResume(this.d.storage.get(this.resumeKey)), prevOrder);
    this.saveOrder();
    this.index = r.index;
    this.tickTimer = this.d.setTimer(() => this.tickLoop(), SPA_TICK_MS);
    if (r.index >= 0) await this.startAt(r.index, r.positionSec, true);
    else this.setStatus("empty");
  }

  dispose(): void {
    if (this.tickTimer) this.d.clearTimer(this.tickTimer);
    if (this.transitionTimer) this.d.clearTimer(this.transitionTimer);
    this.tickTimer = null;
    this.closeSegment("skip");
    this.saveResume();
  }

  // ---------------- permissions ----------------
  private cachedDate(id: string): Date | null {
    const at = this.cachedAt.get(id);
    return at === undefined ? null : new Date(at);
  }

  /**
   * May this item be (re)started — or keep playing (`continuing`) — from the given
   * source kind right now? A stream that is already playing may continue from the
   * browser buffer while offline until playable_until; a new stream start needs network.
   */
  allowed(item: SpaManifestItem, kind: "blob" | "stream" | "any" = "any", continuing = false): boolean {
    const m = this.manifest;
    if (!m || this.status === "no_access") return false;
    const now = new Date(this.d.now());
    if (manifestNeedsRefresh(m, now)) return false;
    const online = this.d.online();
    if (kind === "stream") return (online || continuing) && canStartTrack(item, now, null, true);
    if (kind === "blob") return canStartTrack(item, now, this.cachedDate(item.audioItemId), false);
    return canStartTrack(item, now, this.cachedDate(item.audioItemId), online);
  }

  private findPlayable(from: number): number {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (this.allowed(this.items[i])) return i;
    }
    return -1;
  }

  // ---------------- sources ----------------
  private async sourceFor(item: SpaManifestItem): Promise<Loaded | null> {
    if (this.allowed(item, "blob")) {
      const copy = await this.d.cache.get(item.audioItemId);
      if (copy) return { audioItemId: item.audioItemId, kind: "blob", url: this.d.objectUrl.create(copy.data), ready: false };
    }
    if (!this.allowed(item, "stream")) return null;
    const signed = await this.d.sign(item.audioItemId, "stream");
    if (!signed.ok) {
      if (signed.reason === "no_access") await this.revokeAccess();
      return null;
    }
    return { audioItemId: item.audioItemId, kind: "stream", url: signed.data.url, ready: false };
  }

  private clearSlot(slot: number): void {
    const el = this.d.audios[slot];
    const l = this.loaded[slot];
    el.pause();
    if (l?.kind === "blob") this.d.objectUrl.revoke(l.url);
    el.removeAttribute("src");
    el.load();
    this.loaded[slot] = null;
  }

  private async loadSlot(slot: number, item: SpaManifestItem, positionSec = 0): Promise<boolean> {
    const src = await this.sourceFor(item);
    if (!src) return false;
    this.clearSlot(slot);
    const el = this.d.audios[slot];
    el.src = src.url;
    el.volume = gainToVolume(item.gainDb);
    this.loaded[slot] = src;
    el.load();
    await waitReady(el, this.d, 1);
    if (positionSec > 0) {
      try {
        el.currentTime = positionSec;
      } catch {
        /* not seekable yet */
      }
    }
    return true;
  }

  // ---------------- playback ----------------
  async startAt(i: number, positionSec = 0, auto = false): Promise<void> {
    this.cancelTransition();
    const pi = this.findPlayable(i);
    if (pi < 0) {
      this.stopAll();
      this.setStatus(this.items.length === 0 ? "empty" : this.manifest && manifestNeedsRefresh(this.manifest, new Date(this.d.now())) ? "refresh_required" : "error",
        this.d.online() ? "Нет доступных треков." : "Нет сохранённых треков для офлайна.");
      return;
    }
    const slot = this.active;
    if (!(await this.loadSlot(slot, this.items[pi], pi === i ? positionSec : 0))) {
      if (this.status !== "no_access") this.setStatus("error", "Не удалось загрузить трек.");
      return;
    }
    this.index = pi;
    await this.playActive(auto);
  }

  /** Every play() goes through here: rights/cache/expiry re-checked immediately before. */
  private async playActive(auto = false): Promise<boolean> {
    const item = this.current;
    const l = this.loadedActive();
    if (!item || !l || l.audioItemId !== item.audioItemId || !this.allowed(item, l.kind)) {
      this.clearSlot(this.active);
      this.setStatus("paused");
      return false;
    }
    try {
      await this.activeEl().play();
    } catch {
      this.setStatus(auto ? "needs_gesture" : "error", auto ? null : "Браузер не дал запустить звук.");
      return false;
    }
    this.openSegment(item.audioItemId);
    this.lastTime = this.activeEl().currentTime;
    this.setStatus("playing");
    void this.prepareNext();
    return true;
  }

  async toggle(): Promise<void> {
    if (this.status === "playing") {
      this.activeEl().pause();
      this.closeSegment("skip");
      this.cancelTransition();
      this.saveResume();
      this.setStatus("paused");
      return;
    }
    const l = this.loadedActive();
    if (l && this.current && l.audioItemId === this.current.audioItemId && this.allowed(this.current, l.kind)) {
      if (await this.playActive()) return;
    }
    const r = resolveResume(this.items, parseResume(this.d.storage.get(this.resumeKey)), this.order);
    await this.startAt(r.index >= 0 ? r.index : 0, r.positionSec);
  }

  private async prepareNext(): Promise<void> {
    if (this.index < 0) return;
    const ni = this.findPlayable(nextIndex(this.items.length, this.index));
    const slot = 1 - this.active;
    if (ni < 0 || ni === this.index) {
      if (ni < 0) this.clearSlot(slot);
      return;
    }
    const item = this.items[ni];
    if (this.loaded[slot]?.audioItemId === item.audioItemId && this.loaded[slot]?.ready) return;
    if (!(await this.loadSlot(slot, item))) return;
    const el = this.d.audios[slot];
    const ok = await waitReady(el, this.d, HAVE_ENOUGH_DATA);
    const l = this.loaded[slot];
    if (l && l.audioItemId === item.audioItemId) l.ready = ok;
  }

  private cancelTransition(): void {
    if (this.transitionTimer) this.d.clearTimer(this.transitionTimer);
    this.transitionTimer = null;
  }

  /** Called every tick and on timeupdate: schedule the next track at the media end time. */
  private scheduleTransition(): void {
    if (this.status !== "playing" || this.transitionTimer) return;
    const el = this.activeEl();
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    const remainingMs = (el.duration - el.currentTime) * 1000;
    if (remainingMs > SPA_TRANSITION_LOOKAHEAD_MS) return;
    this.transitionTimer = this.d.setTimer(() => {
      this.transitionTimer = null;
      void this.advance();
    }, Math.max(0, remainingMs));
  }

  /** Switch to the prepared slot (gapless) or fall back to a fresh load. */
  private async advance(): Promise<void> {
    const from = this.index;
    const fromSlot = this.active;
    if (this.status !== "playing") return;
    this.closeSegment("complete");
    const slot = 1 - fromSlot;
    const prep = this.loaded[slot];
    const ni = prep ? this.items.findIndex((i) => i.audioItemId === prep.audioItemId) : -1;
    if (prep && prep.ready && ni >= 0 && this.allowed(this.items[ni], prep.kind)) {
      this.active = slot;
      this.index = ni;
      const el = this.d.audios[slot];
      el.currentTime = 0;
      if (await this.playActive()) {
        this.d.audios[fromSlot].pause();
        return;
      }
    }
    this.active = fromSlot;
    this.d.audios[fromSlot].pause();
    await this.startAt(nextIndex(this.items.length, from));
  }

  private async onEnded(slot: number): Promise<void> {
    // Fallback only: normally advance() already ran from the media-clock schedule.
    if (slot !== this.active || this.status !== "playing") return;
    this.cancelTransition();
    await this.advance();
  }

  private stopAll(): void {
    this.cancelTransition();
    this.closeSegment("skip");
    this.clearSlot(0);
    this.clearSlot(1);
  }

  // ---------------- ticking: expiry, offline switch, transitions ----------------
  async tickLoop(): Promise<void> {
    try {
      await this.tick();
    } finally {
      if (this.tickTimer !== null) this.tickTimer = this.d.setTimer(() => this.tickLoop(), SPA_TICK_MS);
    }
  }

  async tick(): Promise<void> {
    const online = this.d.online();
    if (online !== this.wasOnline) {
      this.wasOnline = online;
      // Split the log segment exactly at the network change.
      if (this.segment) {
        const id = this.segment.audioItemId;
        this.closeSegment("skip");
        if (this.status === "playing") this.openSegment(id);
      }
      if (!online) await this.switchToCache();
      else {
        void this.flushLog();
        void this.refresh();
      }
    }
    this.accumulate(this.active);
    if (online && this.manifest && manifestNeedsRefresh(this.manifest, new Date(this.d.now()))) await this.refresh();
    const item = this.current;
    const l = this.loadedActive();
    if (this.status === "playing" && item && l) {
      if (!this.allowed(item, l.kind, true)) {
        // Rights or cache window closed mid-track: stop it now and move on.
        if (l.kind === "blob" && !this.allowed(item, "blob")) await this.dropCache(item.audioItemId);
        this.closeSegment("skip");
        this.clearSlot(this.active);
        await this.startAt(nextIndex(this.items.length, this.index));
        return;
      }
      this.scheduleTransition();
    }
    if (this.status === "playing" && this.index >= 0 && this.items.length > 0) this.saveResume();
  }

  /** Wi-Fi dropped: move active/prepared stream sources to valid cached copies. */
  async switchToCache(): Promise<void> {
    for (const slot of [this.active, 1 - this.active]) {
      const l = this.loaded[slot];
      if (!l || l.kind !== "stream") continue;
      const item = this.items.find((i) => i.audioItemId === l.audioItemId);
      const copy = item && this.allowed(item, "blob") ? await this.d.cache.get(item.audioItemId) : null;
      const el = this.d.audios[slot];
      if (!copy) {
        if (slot !== this.active) this.clearSlot(slot);
        continue;
      }
      const pos = el.currentTime;
      const wasPlaying = slot === this.active && this.status === "playing";
      const url = this.d.objectUrl.create(copy.data);
      el.pause();
      el.src = url;
      this.loaded[slot] = { audioItemId: l.audioItemId, kind: "blob", url, ready: false };
      el.load();
      await waitReady(el, this.d, 1);
      try {
        el.currentTime = pos;
      } catch {
        /* ignore */
      }
      this.lastTime = pos;
      if (wasPlaying) await el.play().catch(() => this.setStatus("needs_gesture"));
      if (slot !== this.active) this.loaded[slot]!.ready = await waitReady(el, this.d, HAVE_ENOUGH_DATA);
    }
    this.emit();
  }

  // ---------------- manifest refresh ----------------
  async refresh(): Promise<void> {
    if (!this.d.online()) return;
    const res = await this.d.fetchManifest();
    if (!res.ok) {
      if (res.reason === "no_access") await this.revokeAccess();
      return; // network/server errors: keep playing within existing bounds
    }
    const prevOrder = this.items.map((i) => i.audioItemId);
    if (!this.setManifest(res.data)) return;
    this.generation += 1;
    await this.scanCache();
    // Drop any loaded source whose track left the program (even when paused).
    const ids = new Set(this.items.map((i) => i.audioItemId));
    const activeLoaded = this.loadedActive();
    const wasPlaying = this.status === "playing";
    const prepSlot = 1 - this.active;
    if (this.loaded[prepSlot] && !ids.has(this.loaded[prepSlot]!.audioItemId)) this.clearSlot(prepSlot);
    if (this.items.length === 0) {
      this.stopAll();
      this.index = -1;
      this.d.storage.remove(this.resumeKey);
      this.setStatus("empty");
      return;
    }
    if (activeLoaded && !ids.has(activeLoaded.audioItemId)) {
      this.closeSegment("skip");
      this.clearSlot(this.active);
      const r = resolveResume(this.items, { audioItemId: activeLoaded.audioItemId, positionSec: 0, savedAt: this.d.now() }, prevOrder);
      this.index = r.index;
      this.d.storage.remove(this.resumeKey);
      if (wasPlaying) await this.startAt(r.index);
      else this.setStatus("paused");
    } else if (activeLoaded) {
      this.index = this.items.findIndex((i) => i.audioItemId === activeLoaded.audioItemId);
      if (wasPlaying) void this.prepareNext();
    }
    this.saveOrder();
    this.emit();
    void this.downloadAll();
  }

  private setManifest(raw: unknown): boolean {
    try {
      this.manifest = raw ? parseSpaManifest(raw) : null;
      if (this.status === "no_access") this.status = "idle";
      return this.manifest !== null;
    } catch {
      return false;
    }
  }

  /** Server said the user is no longer allowed: stop and wipe protected local data. */
  async revokeAccess(): Promise<void> {
    this.stopAll();
    this.manifest = null;
    this.index = -1;
    this.cachedAt.clear();
    this.generation += 1;
    await this.d.cache.clear();
    this.d.storage.remove(this.resumeKey);
    this.d.storage.remove(this.orderKey);
    this.setStatus("no_access", "Доступ к пилоту закрыт.");
  }

  // ---------------- offline cache ----------------
  private async dropCache(id: string): Promise<void> {
    await this.d.cache.delete(id);
    this.cachedAt.delete(id);
  }

  async scanCache(): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    const byId = new Map(m.items.map((i) => [i.audioItemId, i]));
    for (const id of await this.d.cache.keys()) {
      const item = byId.get(id);
      const copy = item ? await this.d.cache.get(id) : null;
      const deadline = item && copy ? offlineCacheDeadline(item, new Date(copy.cachedAt)) : null;
      if (!item || !copy || !deadline || this.d.now() >= deadline.getTime()) await this.dropCache(id);
      else this.cachedAt.set(id, copy.cachedAt);
    }
    for (const id of [...this.cachedAt.keys()]) if (!byId.has(id)) this.cachedAt.delete(id);
  }

  async downloadAll(): Promise<void> {
    const gen = this.generation;
    for (const item of this.items) {
      if (gen !== this.generation || !this.d.online()) return;
      if (!item.offlineAllowed || this.cachedAt.has(item.audioItemId)) continue;
      const signed = await this.d.sign(item.audioItemId, "offline");
      if (!signed.ok) {
        if (signed.reason === "no_access") return this.revokeAccess();
        continue;
      }
      const blob = await this.d.download(signed.data.url);
      if (!blob) continue;
      // Re-check against the LATEST manifest right before writing (stale download guard).
      const latest = this.items.find((i) => i.audioItemId === item.audioItemId);
      const cachedAt = this.d.now();
      const deadline = latest ? offlineCacheDeadline(latest, new Date(cachedAt)) : null;
      if (gen !== this.generation || !latest || !latest.offlineAllowed || !deadline || cachedAt >= deadline.getTime()) continue;
      await this.d.cache.put(item.audioItemId, blob, cachedAt);
      this.cachedAt.set(item.audioItemId, cachedAt);
      this.emit();
    }
  }

  // ---------------- log ----------------
  private openSegment(audioItemId: string): void {
    this.segment = { audioItemId, startedAt: this.d.now(), playedMs: 0, offline: !this.d.online() };
  }

  private accumulate(slot: number): void {
    if (slot !== this.active || !this.segment || this.status !== "playing") return;
    const el = this.d.audios[slot];
    const dt = el.currentTime - this.lastTime;
    if (dt > 0 && dt < 5) this.segment.playedMs += dt * 1000;
    this.lastTime = el.currentTime;
  }

  closeSegment(kind: "complete" | "skip" | "error"): void {
    this.accumulate(this.active);
    const s = this.segment;
    this.segment = null;
    if (!s || !this.d.playerId || !this.d.zoneId || s.playedMs < 1000) return;
    const q = enqueueLog(parseLogQueue(this.d.storage.get(this.logKey)), {
      client_event_id: this.d.uuid(),
      player_id: this.d.playerId,
      zone_id: this.d.zoneId,
      audio_item_id: s.audioItemId,
      event: kind,
      started_at: new Date(s.startedAt).toISOString(),
      ended_at: new Date(Math.max(this.d.now(), s.startedAt)).toISOString(),
      played_ms: Math.round(s.playedMs),
      offline: s.offline,
    });
    this.d.storage.set(this.logKey, JSON.stringify(q));
  }

  async flushLog(): Promise<void> {
    if (!this.d.online()) return;
    const q = parseLogQueue(this.d.storage.get(this.logKey));
    if (q.length === 0) return;
    const res = await this.d.sync(q.slice(0, 500));
    if (res.ok) this.d.storage.set(this.logKey, JSON.stringify(ackLog(parseLogQueue(this.d.storage.get(this.logKey)), res.data)));
    else if (res.reason === "no_access") await this.revokeAccess();
  }

  // ---------------- persistence & ui ----------------
  saveResume(): void {
    const item = this.current;
    if (!item || this.loadedActive()?.audioItemId !== item.audioItemId) return;
    this.d.storage.set(this.resumeKey, JSON.stringify({ audioItemId: item.audioItemId, positionSec: this.activeEl().currentTime, savedAt: this.d.now() }));
  }

  private saveOrder(): void {
    this.order = this.items.map((i) => i.audioItemId);
    this.d.storage.set(this.orderKey, JSON.stringify(this.order));
  }

  private setStatus(s: EngineStatus, message: string | null = null): void {
    this.status = s;
    this.message = message;
    this.emit();
  }

  private emit(): void {
    this.d.onChange();
  }
}

function gainToVolume(gainDb: number | null): number {
  if (gainDb === null) return 1;
  return Math.max(0, Math.min(1, Math.pow(10, gainDb / 20)));
}

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Resolve when readyState >= target (or after 15 s); true if reached. */
function waitReady(el: AudioLike, d: Pick<EngineDeps, "setTimer" | "clearTimer">, target: number): Promise<boolean> {
  if (el.readyState >= target) return Promise.resolve(true);
  return new Promise((resolve) => {
    const events = target >= HAVE_ENOUGH_DATA ? ["canplaythrough"] : ["loadedmetadata", "canplay", "canplaythrough"];
    let timer: unknown = null;
    const done = () => {
      events.forEach((e) => el.removeEventListener(e, done));
      if (timer) d.clearTimer(timer);
      resolve(el.readyState >= target);
    };
    events.forEach((e) => el.addEventListener(e, done, { once: true }));
    timer = d.setTimer(done, 15000);
  });
}
