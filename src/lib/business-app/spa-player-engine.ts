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
 *
 * Re-review 2026-10-13 (Codex A2):
 *  - every cached copy carries the server deadline returned by sign(…, "offline")
 *    (`offline_cache_until` for THAT download); the effective deadline is
 *    min(server deadline, manifest deadline from cachedAt) and is enforced on write,
 *    on every play and on every tick;
 *  - every tick purges ALL expired copies (any status, online or offline) and any
 *    loaded blob source of them — before any network wait;
 *  - expiry stop happens before the (non-blocking, single-flight) manifest refresh;
 *    the Wi-Fi→cache switch re-checks rights right before play();
 *  - transitions overlap by SPA_CROSSFADE_MS: the next pre-buffered element starts
 *    before the current one ends and the two are cross-faded, so main-thread / timer
 *    latency below the overlap can only shorten the fade, never create silence; a
 *    stalled current track (media clock not advancing) re-schedules instead of
 *    switching early.
 *
 * Re-review 2026-10-13 (Codex A4):
 *  - when the slots support `startAfter` (Web Audio, see spa-webaudio.ts) the next
 *    track is scheduled on the AUDIO clock as soon as the current one is within
 *    LOOKAHEAD of its end, so main-thread latency of any size cannot create a gap;
 *    the JS timer only does the bookkeeping afterwards. The overlap path stays as a
 *    fallback for HTMLAudio slots.
 *  - ending a cross-fade early (outgoing grant expired) still prepares the next track.
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
export const SPA_CROSSFADE_MS = 400;
const FADE_STEP_MS = 50;

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
  /**
   * Optional sample-accurate scheduling (Web Audio slots): start from 0 exactly when
   * `prev` ends on the audio clock. Returns false when not possible (fallback: overlap).
   */
  startAfter?(prev: AudioLike): boolean;
  /**
   * Optional hard stop on the audio clock at wall time `epochMs` (null = none), so a grant
   * / copy deadline is enforced even if the main thread is late. Fires `ended`.
   */
  stopAt?(epochMs: number | null): void;
}

/** `until`: server deadline (epoch ms) for this copy, from sign(…, "offline"). */
export type CachedCopy = { data: Blob; cachedAt: number; until: number };

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
    put(id: string, data: Blob, cachedAt: number, until: number): Promise<void>;
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
  /** Effective deadline (epoch ms) per cached copy. */
  cacheUntil = new Map<string, number>();

  private active = 0;
  private loaded: [Loaded | null, Loaded | null] = [null, null];
  private segment: Segment | null = null;
  private lastTime = 0;
  private tickTimer: unknown = null;
  private transitionTimer: unknown = null;
  private generation = 0;
  private order: string[] = [];
  private wasOnline = true;
  private refreshing: Promise<void> | null = null;
  private fadeTimer: unknown = null;
  private handoffTimer: unknown = null;
  /** Slot whose start is already scheduled on the audio clock (gapless path). */
  private scheduledSlot: number | null = null;
  private scheduledPaused = false;
  /** Bumped by revokeAccess: results of operations started before it are discarded. */
  private accessEpoch = 0;
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
    this.clearHandoff();
    this.tickTimer = null;
    this.closeSegment("skip");
    this.saveResume();
  }

  // ---------------- permissions ----------------
  private cachedDate(id: string, atMs = this.d.now()): Date | null {
    const at = this.cachedAt.get(id);
    const until = this.cacheUntil.get(id);
    if (at === undefined || until === undefined || atMs >= until) return null;
    return new Date(at);
  }

  /** Effective deadline of a copy: min(server deadline, manifest deadline from cachedAt). */
  private copyDeadline(id: string, cachedAt: number, serverUntil: number): number | null {
    const item = this.items.find((i) => i.audioItemId === id);
    const m = item ? offlineCacheDeadline(item, new Date(cachedAt)) : null;
    if (!m || !Number.isFinite(serverUntil)) return null;
    return Math.min(m.getTime(), serverUntil);
  }

  /**
   * May this item be (re)started — or keep playing (`continuing`) — from the given
   * source kind right now? A stream that is already playing may continue from the
   * browser buffer while offline until playable_until; a new stream start needs network.
   */
  allowed(item: SpaManifestItem, kind: "blob" | "stream" | "any" = "any", continuing = false, atMs = this.d.now()): boolean {
    const m = this.manifest;
    if (!m || this.status === "no_access") return false;
    const now = new Date(atMs);
    if (manifestNeedsRefresh(m, now)) return false;
    const online = this.d.online();
    if (kind === "stream") return (online || continuing) && canStartTrack(item, now, null, true);
    if (kind === "blob") return canStartTrack(item, now, this.cachedDate(item.audioItemId, atMs), false);
    return canStartTrack(item, now, this.cachedDate(item.audioItemId, atMs), online);
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
  private async sourceFor(item: SpaManifestItem, atMs?: number): Promise<Loaded | null> {
    // A copy is used only if it is still valid when the track will actually start.
    if (this.allowed(item, "blob") && (atMs === undefined || this.allowed(item, "blob", false, atMs))) {
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
    if (slot === this.scheduledSlot) this.scheduledSlot = null;
    const el = this.d.audios[slot];
    const l = this.loaded[slot];
    el.pause();
    if (l?.kind === "blob") this.d.objectUrl.revoke(l.url);
    el.removeAttribute("src");
    el.load();
    this.loaded[slot] = null;
  }

  private async loadSlot(slot: number, item: SpaManifestItem, positionSec = 0, atMs?: number): Promise<boolean> {
    const epoch = this.accessEpoch;
    const src = await this.sourceFor(item, atMs);
    if (!src || epoch !== this.accessEpoch || this.status === "no_access") {
      if (src?.kind === "blob") this.d.objectUrl.revoke(src.url);
      return false;
    }
    this.clearSlot(slot);
    const el = this.d.audios[slot];
    el.src = src.url;
    el.volume = gainToVolume(item.gainDb);
    this.loaded[slot] = src;
    el.load();
    await waitReady(el, this.d, 1);
    if (epoch !== this.accessEpoch || this.loaded[slot] !== src) {
      if (this.loaded[slot] === src) this.clearSlot(slot);
      return false;
    }
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
  private async playActive(auto = false, prepare = true): Promise<boolean> {
    const item = this.current;
    const l = this.loadedActive();
    if (!item || !l || l.audioItemId !== item.audioItemId || !this.allowed(item, l.kind)) {
      this.clearSlot(this.active);
      if (this.status !== "no_access") this.setStatus("paused");
      return false;
    }
    try {
      await this.activeEl().play();
    } catch {
      this.setStatus(auto ? "needs_gesture" : "error", auto ? null : "Браузер не дал запустить звук.");
      return false;
    }
    this.applyDeadline(this.active);
    this.openSegment(item.audioItemId);
    this.lastTime = this.activeEl().currentTime;
    this.setStatus("playing");
    if (prepare) void this.prepareNext();
    return true;
  }

  async toggle(): Promise<void> {
    if (this.status === "playing") {
      this.settleScheduled();
      this.finishHandoff();
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
    // Never replace an already-audible scheduled track; commit it first.
    if (this.scheduledStarted()) this.settleScheduled();
    const ni = this.findPlayable(nextIndex(this.items.length, this.index));
    const slot = 1 - this.active;
    if (ni < 0 || ni === this.index) {
      if (ni < 0) this.clearSlot(slot);
      return;
    }
    const item = this.items[ni];
    if (this.loaded[slot]?.audioItemId === item.audioItemId && this.loaded[slot]?.ready) return;
    const cur = this.activeEl();
    const leftMs = Number.isFinite(cur.duration) ? Math.max(0, (cur.duration - cur.currentTime) * 1000) : 0;
    if (!(await this.loadSlot(slot, item, 0, this.d.now() + leftMs + SPA_TICK_MS))) return;
    const el = this.d.audios[slot];
    const ok = await waitReady(el, this.d, HAVE_ENOUGH_DATA);
    const l = this.loaded[slot];
    if (l && l.audioItemId === item.audioItemId) l.ready = ok;
    if (ok) {
      // A pending fallback (overlap) timer was planned for the old source: re-plan so the
      // new source can be scheduled on the audio clock.
      if (this.scheduledSlot === null && this.transitionTimer && !this.handoffTimer && !this.fadeTimer) {
        this.d.clearTimer(this.transitionTimer);
        this.transitionTimer = null;
      }
      this.scheduleTransition();
    }
  }

  private cancelTransition(): void {
    if (this.transitionTimer) this.d.clearTimer(this.transitionTimer);
    this.transitionTimer = null;
    if (this.scheduledSlot !== null) {
      this.d.audios[this.scheduledSlot].pause();
      this.scheduledSlot = null;
    }
  }

  /** Gapless path: schedule the prepared slot on the audio clock. */
  private trySchedule(el: AudioLike, remainingMs: number): boolean {
    const slot = 1 - this.active;
    const next = this.d.audios[slot];
    const prep = this.loaded[slot];
    if (!next.startAfter || !prep || !prep.ready) return false;
    const ni = this.items.findIndex((i) => i.audioItemId === prep.audioItemId);
    if (ni < 0 || ni !== this.findPlayable(nextIndex(this.items.length, this.index))) return false;
    const item = this.items[ni];
    // Rights re-checked now and for the scheduled start moment.
    // Rights must hold now AND at the scheduled start moment: grant, manifest expiry and,
    // for blobs, the copy's server/manifest deadline.
    const startMs = this.d.now() + remainingMs;
    if (!this.allowed(item, prep.kind) || !this.allowed(item, prep.kind, false, startMs + SPA_TICK_MS)) return false;
    next.currentTime = 0;
    next.volume = gainToVolume(item.gainDb);
    if (!next.startAfter(el)) return false;
    this.scheduledSlot = slot;
    this.scheduledPaused = next.paused;
    this.applyDeadline(slot);
    this.armCommit(Math.max(0, remainingMs));
    return true;
  }

  /**
   * Wall-clock timer is only a hint: commit when the outgoing slot has really finished on
   * the audio clock (it stops advancing while the AudioContext is suspended).
   */
  private armCommit(ms: number): void {
    this.transitionTimer = this.d.setTimer(() => {
      this.transitionTimer = null;
      if (this.scheduledSlot === null || this.status !== "playing") return;
      const cur = this.activeEl();
      const left = (cur.duration - cur.currentTime) * 1000;
      // No positive tolerance: committing stops A, so wait until it is really at its end.
      if (!cur.paused && Number.isFinite(left) && left > 0) {
        this.armCommit(Math.max(5, left));
        return;
      }
      if (this.scheduledStarted()) this.commitScheduled();
      else if (!cur.paused || endedNaturally(cur)) this.armCommit(5);
      // else: A stopped early; onEnded/tick move on.
    }, ms);
  }

  /** Expected `paused` of a scheduled-but-not-started slot for this adapter. */
  private scheduledPausedState(): boolean {
    // Web Audio slots report a scheduled node as running; models without it as paused.
    return this.scheduledPaused;
  }

  /** Earliest wall time at which the track loaded in `slot` must fall silent. */
  private deadlineFor(slot: number): number | null {
    const lo = this.loaded[slot];
    const m = this.manifest;
    const item = lo ? this.items.find((i) => i.audioItemId === lo.audioItemId) : undefined;
    if (!lo || !m || !item) return null;
    let d = m.expiresAt.getTime();
    if (item.playableUntil) d = Math.min(d, item.playableUntil.getTime());
    if (lo.kind === "blob") {
      const at = this.cachedAt.get(item.audioItemId);
      const until = this.cacheUntil.get(item.audioItemId);
      const eff = at === undefined || until === undefined ? null : this.copyDeadline(item.audioItemId, at, until);
      d = eff === null ? this.d.now() : Math.min(d, eff);
    }
    return d;
  }

  /** Hand the deadline to the audio clock (Web Audio slots), independent of JS latency. */
  private applyDeadline(slot: number): void {
    this.d.audios[slot].stopAt?.(this.deadlineFor(slot));
  }

  private applyDeadlines(): void {
    this.applyDeadline(0);
    this.applyDeadline(1);
  }

  /**
   * Keep a pending audio-clock start only while it is still allowed at its CURRENT
   * expected start (which moves if the AudioContext is suspended). Synchronous.
   */
  private validateScheduled(): void {
    const slot = this.scheduledSlot;
    if (slot === null) return;
    const lo = this.loaded[slot];
    const item = lo ? this.items.find((i) => i.audioItemId === lo.audioItemId) : undefined;
    const cur = this.activeEl();
    const leftMs = Math.max(0, (cur.duration - cur.currentTime) * 1000);
    const started = this.scheduledStarted();
    // Outgoing stopped early or the scheduled node was dropped (suspension): not a valid plan.
    const lost = !started && (this.d.audios[slot].paused !== this.scheduledPausedState() || (cur.paused && !endedNaturally(cur)));
    const ok =
      !lost &&
      !!lo &&
      !!item &&
      lo.ready &&
      (started ? this.allowed(item, lo.kind, true) : this.allowed(item, lo.kind, false, this.d.now() + leftMs + SPA_TICK_MS));
    if (ok) return;
    if (started) {
      // B is already audible: commit so the normal active-track checks stop it.
      if (this.transitionTimer) this.d.clearTimer(this.transitionTimer);
      this.transitionTimer = null;
      this.commitScheduled();
      return;
    }
    this.unschedule();
  }

  /** True when the scheduled slot is already audible (outgoing slot finished on the audio clock). */
  /**
   * True only when the scheduled slot is really audible: it is running AND either its own
   * clock advanced or the outgoing track reached its NATURAL end. An outgoing track that
   * was stopped early (rights deadline, interruption) does not count.
   */
  private scheduledStarted(): boolean {
    if (this.scheduledSlot === null) return false;
    const next = this.d.audios[this.scheduledSlot];
    if (next.paused) return false;
    return next.currentTime > 0 || endedNaturally(this.activeEl());
  }

  /**
   * Before any operation that replaces/pauses sources: if the audio-clock transition has
   * already happened, commit it first so engine state matches what is audible; otherwise
   * drop the pending start (tick re-plans).
   */
  private settleScheduled(): void {
    if (this.scheduledSlot === null) return;
    if (this.scheduledStarted()) {
      if (this.transitionTimer) this.d.clearTimer(this.transitionTimer);
      this.transitionTimer = null;
      this.commitScheduled();
    } else this.unschedule();
  }

  /** Drop a pending audio-clock start (rights may have changed); tick re-plans. */
  private unschedule(): void {
    if (this.scheduledSlot === null) return;
    this.cancelTransition();
  }

  /** Bookkeeping after an audio-clock transition (audio already switched). */
  private commitScheduled(): void {
    const slot = this.scheduledSlot;
    this.scheduledSlot = null;
    if (slot === null || this.status !== "playing") return;
    const from = this.active;
    const lo = this.loaded[slot];
    const ni = lo ? this.items.findIndex((i) => i.audioItemId === lo.audioItemId) : -1;
    this.closeSegment("complete");
    this.active = slot;
    this.d.audios[from].pause();
    if (!lo || ni < 0) {
      // B left the program: it must not keep sounding. Stop it; tick moves on.
      this.clearSlot(slot);
      this.emit();
      return;
    }
    this.index = ni;
    this.applyDeadline(slot);
    // Next tick re-checks rights (continuing) and stops it if needed.
    // The new track has been audible since its audio-clock start: count it from 0.
    const el = this.activeEl();
    this.openSegment(lo.audioItemId);
    if (this.segment) this.segment.startedAt = this.d.now() - Math.max(0, el.currentTime) * 1000;
    this.lastTime = 0;
    this.accumulate(this.active);
    this.saveResume();
    this.emit();
    void this.prepareNext();
  }

  /** Called every tick and on timeupdate: schedule the next track at the media end time. */
  private scheduleTransition(): void {
    if (this.status !== "playing" || this.transitionTimer) return;
    const el = this.activeEl();
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    const remainingMs = (el.duration - el.currentTime) * 1000;
    // Audio-clock slots: schedule as soon as the next track is ready (no dependency on a
    // tick landing inside a lookahead window, so even multi-second stalls cannot gap).
    if (this.trySchedule(el, remainingMs)) return;
    if (remainingMs > SPA_TRANSITION_LOOKAHEAD_MS) return;
    const pos = el.currentTime;
    this.transitionTimer = this.d.setTimer(() => {
      this.transitionTimer = null;
      if (this.status !== "playing") return;
      const cur = this.activeEl();
      const left = (cur.duration - cur.currentTime) * 1000;
      // Media clock stalled (buffering) or drifted: re-plan from the real position.
      if (left > SPA_CROSSFADE_MS + FADE_STEP_MS && (cur.currentTime <= pos || left > SPA_TRANSITION_LOOKAHEAD_MS)) {
        this.scheduleTransition();
        return;
      }
      void this.advance(Math.max(0, left));
    }, Math.max(0, remainingMs - SPA_CROSSFADE_MS));
  }

  private clearHandoff(): void {
    if (this.fadeTimer) this.d.clearTimer(this.fadeTimer);
    if (this.handoffTimer) this.d.clearTimer(this.handoffTimer);
    this.fadeTimer = null;
    this.handoffTimer = null;
  }

  /** End an in-progress cross-fade now: silence the outgoing slot, full gain on the active one. */
  private finishHandoff(): void {
    const pending = this.fadeTimer !== null || this.handoffTimer !== null;
    this.clearHandoff();
    if (!pending) return;
    const out = this.d.audios[1 - this.active];
    out.pause();
    const item = this.current;
    if (item) this.activeEl().volume = gainToVolume(item.gainDb);
  }

  /** Cross-fade out→in over `ms`, then stop the outgoing slot and prepare the next track. */
  private crossfade(outSlot: number, ms: number): void {
    const out = this.d.audios[outSlot];
    const inEl = this.activeEl();
    const outItem = this.loaded[outSlot] ? this.items.find((i) => i.audioItemId === this.loaded[outSlot]!.audioItemId) : null;
    const outGain = gainToVolume(outItem?.gainDb ?? null);
    const inGain = gainToVolume(this.current?.gainDb ?? null);
    inEl.volume = inGain;
    const start = this.d.now();
    const step = () => {
      const k = ms <= 0 ? 1 : Math.min(1, (this.d.now() - start) / ms);
      out.volume = outGain * (1 - k);
      this.fadeTimer = k < 1 ? this.d.setTimer(step, FADE_STEP_MS) : null;
    };
    step();
    this.handoffTimer = this.d.setTimer(() => {
      this.handoffTimer = null;
      if (this.fadeTimer) this.d.clearTimer(this.fadeTimer);
      this.fadeTimer = null;
      out.pause();
      inEl.volume = inGain;
      if (this.status === "playing") void this.prepareNext();
    }, ms + 100);
  }

  /** Switch to the prepared slot (gapless) or fall back to a fresh load. */
  private async advance(overlapMs = 0): Promise<void> {
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
      // Incoming track starts at full gain immediately (no fade-in): any timer latency can
      // only shorten the overlap, never produce silence.
      el.volume = gainToVolume(this.items[ni].gainDb);
      if (await this.playActive(false, overlapMs <= 0)) {
        if (overlapMs > 0) this.crossfade(fromSlot, overlapMs);
        else this.d.audios[fromSlot].pause();
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
    if (this.scheduledSlot !== null && this.scheduledStarted()) {
      // Audio already switched on the audio clock; just do the bookkeeping now.
      if (this.transitionTimer) this.d.clearTimer(this.transitionTimer);
      this.transitionTimer = null;
      this.commitScheduled();
      return;
    }
    // Stopped early (deadline/interruption) or never scheduled: cancel any future start
    // and move to the allowed successor now.
    this.cancelTransition();
    await this.advance();
  }

  private stopAll(): void {
    this.cancelTransition();
    this.clearHandoff();
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
    // Invariant: engine state follows what is audible. An audio-clock transition that
    // already happened is committed before anything else looks at the active slot.
    if (this.scheduledStarted()) this.settleScheduled();
    const online = this.d.online();
    if (online !== this.wasOnline) {
      this.wasOnline = online;
      if (!online) this.switchPending = true;
      // Split the log segment exactly at the network change.
      if (this.segment) {
        const id = this.segment.audioItemId;
        this.closeSegment("skip");
        if (this.status === "playing") this.openSegment(id);
      }
      if (online) {
        void this.flushLog();
        void this.refresh();
      }
    }
    this.accumulate(this.active);
    // 1) Purge every expired cached copy (any status, any network) — no network waits first.
    const stopActive = this.expireCopies();
    // 2a) During a cross-fade the outgoing slot is still audible: it must stay allowed too.
    this.checkOutgoing();
    // 2b) A pending audio-clock start must stay allowed at its (possibly shifted) start.
    if (this.status === "playing") this.validateScheduled();
    // 2) Stop a current track that is no longer allowed, synchronously.
    // The track is identified by what is LOADED, not by index (index may lag a refresh).
    const l = this.loadedActive();
    const item = l ? this.items.find((i) => i.audioItemId === l.audioItemId) : undefined;
    let stopped = false;
    if (this.status === "playing" && (stopActive || !l || !item || !this.allowed(item, l.kind, true))) {
      stopped = true;
      this.closeSegment("skip");
      this.clearSlot(this.active);
      this.clearSlot(1 - this.active);
      this.clearHandoff();
      this.setStatus("paused");
    }
    // 3) Only now do anything that may wait.
    if (!online && this.wasOnlineSwitchPending()) await this.switchToCache();
    if (online && this.manifest && manifestNeedsRefresh(this.manifest, new Date(this.d.now()))) void this.refresh();
    if (stopped || stopActive) {
      if (this.items.length === 0) this.setStatus("empty");
      else if (this.index >= 0) await this.startAt(nextIndex(this.items.length, Math.min(this.index, this.items.length - 1)));
      return;
    }
    // Interrupted (e.g. AudioContext suspended -> slots paused): resume only through
    // playActive, which re-checks rights and re-applies the deadline.
    const act = this.activeEl();
    if (this.status === "playing" && this.loadedActive() && act.paused && !endedNaturally(act) && this.scheduledSlot === null && !this.handoffTimer) {
      this.closeSegment("skip");
      await this.playActive(false, true);
      return;
    }
    if (this.status === "playing") this.scheduleTransition();
    if (this.status === "playing" && this.index >= 0 && this.items.length > 0) this.saveResume();
  }

  private checkOutgoing(): void {
    if (this.handoffTimer === null && this.fadeTimer === null) return;
    const slot = 1 - this.active;
    const lo = this.loaded[slot];
    const item = lo ? this.items.find((i) => i.audioItemId === lo.audioItemId) : null;
    if (!lo || !item || !this.allowed(item, lo.kind, true)) {
      this.finishHandoff();
      this.d.audios[slot].pause();
      // The cancelled handoff would have prepared the next track: do it now.
      if (this.status === "playing") void this.prepareNext();
    }
  }

  private switchPending = false;
  private wasOnlineSwitchPending(): boolean {
    const p = this.switchPending;
    this.switchPending = false;
    return p;
  }

  /**
   * Drop every cached copy past its effective deadline (or no longer in the manifest),
   * synchronously from the in-memory index; clears loaded blob sources of those copies.
   * Returns true when the active source was cleared.
   */
  private expireCopies(): boolean {
    const now = this.d.now();
    const ids = new Set(this.items.map((i) => i.audioItemId));
    let activeHit = false;
    let reprepare = false;
    for (const [id, until] of [...this.cacheUntil]) {
      const at = this.cachedAt.get(id);
      const eff = at === undefined ? null : this.copyDeadline(id, at, until);
      if (ids.has(id) && eff !== null && now < eff) continue;
      this.cachedAt.delete(id);
      this.cacheUntil.delete(id);
      void this.d.cache.delete(id);
      for (const slot of [0, 1]) {
        const lo = this.loaded[slot];
        if (lo?.kind === "blob" && lo.audioItemId === id) {
          if (slot === this.active && this.status === "playing") activeHit = true;
          else if (this.status === "playing") reprepare = true;
          this.clearSlot(slot);
        }
      }
    }
    for (const id of [...this.cachedAt.keys()]) if (!this.cacheUntil.has(id)) this.cachedAt.delete(id);
    // Any loaded blob whose copy is no longer valid in the index (any status) is unloaded too.
    for (const slot of [0, 1]) {
      const lo = this.loaded[slot];
      if (lo?.kind !== "blob" || this.cachedDate(lo.audioItemId) !== null) continue;
      if (slot === this.active && this.status === "playing") activeHit = true;
      else if (this.status === "playing") reprepare = true;
      this.clearSlot(slot);
    }
    // A cleared prepared copy is replaced right away (e.g. by the stream), not at the boundary.
    if (reprepare && !activeHit) void this.prepareNext();
    if (activeHit) {
      this.closeSegment("skip");
      this.clearHandoff();
      this.clearSlot(1 - this.active);
    }
    return activeHit;
  }

  /** Wi-Fi dropped: move active/prepared stream sources to valid cached copies. */
  async switchToCache(): Promise<void> {
    // Replacing sources cancels audio-clock starts: commit an already-audible B first
    // (it then switches to its cached copy like any active track), else drop the schedule.
    this.settleScheduled();
    for (const slot of [this.active, 1 - this.active]) {
      const l = this.loaded[slot];
      if (!l || l.kind !== "stream") continue;
      const epoch = this.accessEpoch;
      const found = this.items.find((i) => i.audioItemId === l.audioItemId);
      const el = this.d.audios[slot];
      // The prepared slot must be valid when it will start, not just now.
      const atMs = slot === this.active ? this.d.now() : this.d.now() + Math.max(0, (this.activeEl().duration - this.activeEl().currentTime) * 1000) + SPA_TICK_MS;
      const copy = found && this.allowed(found, "blob") && this.allowed(found, "blob", false, atMs) ? await this.d.cache.get(found.audioItemId) : null;
      // Stale after the await? (refresh removed/replaced the source, access revoked)
      const item = this.items.find((i) => i.audioItemId === l.audioItemId);
      if (epoch !== this.accessEpoch || this.loaded[slot] !== l || !item) continue;
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
      // Re-check right before play(): the copy may have expired / been revoked while loading,
      // or the track may have left the manifest.
      const still = this.loaded[slot];
      const cur = this.items.find((i) => i.audioItemId === l.audioItemId);
      if (epoch !== this.accessEpoch || !cur || !still || still.url !== url || !this.allowed(cur, "blob")) {
        this.clearSlot(slot);
        continue;
      }
      this.applyDeadline(slot);
      if (wasPlaying && slot === this.active && this.status === "playing") await el.play().catch(() => this.setStatus("needs_gesture"));
      if (slot !== this.active) this.loaded[slot]!.ready = await waitReady(el, this.d, HAVE_ENOUGH_DATA);
    }
    if (this.status === "playing") this.scheduleTransition();
    this.emit();
  }

  // ---------------- manifest refresh ----------------
  refresh(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    if (!this.d.online()) return;
    const epoch = this.accessEpoch;
    const res = await this.d.fetchManifest();
    // A response to a request started before access was revoked is never applied.
    if (epoch !== this.accessEpoch) return;
    if (!res.ok) {
      if (res.reason === "no_access") await this.revokeAccess();
      return; // network/server errors: keep playing within existing bounds
    }
    const prevOrder = this.items.map((i) => i.audioItemId);
    if (!this.setManifest(res.data)) return;
    // Everything below up to the first await is synchronous: the audible state is made
    // consistent with the new manifest before any other callback can run.
    this.validateScheduled();
    this.generation += 1;
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
      await this.scanCache();
      return;
    }
    let restartAt: number | null = null;
    if (activeLoaded && !ids.has(activeLoaded.audioItemId)) {
      this.closeSegment("skip");
      this.clearSlot(this.active);
      const r = resolveResume(this.items, { audioItemId: activeLoaded.audioItemId, positionSec: 0, savedAt: this.d.now() }, prevOrder);
      this.index = r.index;
      this.d.storage.remove(this.resumeKey);
      if (wasPlaying) restartAt = r.index;
      else this.setStatus("paused");
    } else if (activeLoaded) {
      this.index = this.items.findIndex((i) => i.audioItemId === activeLoaded.audioItemId);
    }
    this.applyDeadlines();
    this.saveOrder();
    this.emit();
    await this.scanCache();
    if (epoch !== this.accessEpoch) return;
    if (restartAt !== null) await this.startAt(restartAt);
    else if (activeLoaded && wasPlaying && this.status === "playing") void this.prepareNext();
    if (this.status === "playing") this.scheduleTransition();
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
    this.accessEpoch += 1;
    this.stopAll();
    this.manifest = null;
    this.index = -1;
    this.cachedAt.clear();
    this.cacheUntil.clear();
    this.generation += 1;
    await this.d.cache.clear();
    this.d.storage.remove(this.resumeKey);
    this.d.storage.remove(this.orderKey);
    this.setStatus("no_access", "Доступ к пилоту закрыт.");
  }

  // ---------------- offline cache ----------------
  private async dropCache(id: string): Promise<void> {
    this.dropCacheIndex(id);
    this.clearBlobSources(id);
    await this.d.cache.delete(id);
  }

  async scanCache(): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    const byId = new Map(m.items.map((i) => [i.audioItemId, i]));
    for (const id of await this.d.cache.keys()) {
      const item = byId.get(id);
      const copy = item ? await this.d.cache.get(id) : null;
      const deadline = item && copy ? this.copyDeadline(id, copy.cachedAt, copy.until) : null;
      if (!item || !copy || deadline === null || this.d.now() >= deadline) await this.dropCache(id);
      else {
        this.cachedAt.set(id, copy.cachedAt);
        this.cacheUntil.set(id, copy.until);
      }
    }
    for (const id of [...this.cachedAt.keys()]) if (!byId.has(id)) this.dropCacheIndex(id);
  }

  /** Unload (and revoke) any slot holding a blob of this copy; playing state is handled by tick. */
  private clearBlobSources(id: string): void {
    for (const slot of [0, 1]) {
      const lo = this.loaded[slot];
      if (lo?.kind !== "blob" || lo.audioItemId !== id) continue;
      if (slot !== this.active) this.finishHandoff();
      else this.closeSegment("skip");
      this.clearSlot(slot);
    }
  }

  private dropCacheIndex(id: string): void {
    this.cachedAt.delete(id);
    this.cacheUntil.delete(id);
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
      // The server's deadline for THIS download is binding (it may be shorter than the
      // client manifest says); no deadline = no offline copy.
      const serverUntil = signed.data.offlineCacheUntil ? Date.parse(signed.data.offlineCacheUntil) : NaN;
      if (!Number.isFinite(serverUntil)) continue;
      const blob = await this.d.download(signed.data.url);
      if (!blob) continue;
      // Re-check against the LATEST manifest + server deadline right before writing.
      const latest = this.items.find((i) => i.audioItemId === item.audioItemId);
      const cachedAt = this.d.now();
      const deadline = latest ? this.copyDeadline(item.audioItemId, cachedAt, serverUntil) : null;
      if (gen !== this.generation || !latest || !latest.offlineAllowed || deadline === null || cachedAt >= deadline) continue;
      await this.d.cache.put(item.audioItemId, blob, cachedAt, serverUntil);
      if (gen !== this.generation || this.d.now() >= deadline) {
        await this.dropCache(item.audioItemId);
        continue;
      }
      this.cachedAt.set(item.audioItemId, cachedAt);
      this.cacheUntil.set(item.audioItemId, serverUntil);
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

/** The element played to its natural end (not stopped early by a deadline/interruption). */
function endedNaturally(el: AudioLike): boolean {
  return el.paused && Number.isFinite(el.duration) && el.currentTime >= el.duration - 0.01;
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
