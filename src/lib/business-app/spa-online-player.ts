/**
 * Business SPA pilot (0e05333f), stage 1 — ONLINE player (Sergey 2026-10-13 19:16 MSK).
 *
 * Plays the current ELIGIBLE manifest track by track from short-lived signed URLs.
 * No offline cache: nothing is downloaded or stored on the device. Every track start
 * asks the server for a fresh signed URL (server re-checks pilot access + manifest), so a
 * user without access never receives audio. The offline engine (spa-player-engine.ts)
 * stays in the repo with its tests for the next stage and is not used here.
 */

import type { SpaManifestItem } from "./spa-manifest";

export type OnlineAudio = {
  src: string;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: "src"): void;
  load(): void;
};

export type OnlineSignResult = { ok: true; data: { url: string } } | { ok: false; reason: string };

export type OnlineStatus = "idle" | "loading" | "playing" | "paused" | "no_access" | "error";

export type OnlineDeps = {
  audio: OnlineAudio;
  sign(audioItemId: string): Promise<OnlineSignResult>;
  onChange(): void;
};

/** Sign errors after which the track is skipped (removed / expired), not retried. */
const SKIP_REASONS = new Set(["not_in_manifest", "expired", "invalid_request"]);

export class SpaOnlinePlayer {
  items: SpaManifestItem[];
  index = -1;
  status: OnlineStatus = "idle";
  message: string | null = null;
  /** Bumped on every user/automatic transition; stale async results are ignored. */
  private op = 0;
  private failures = 0;
  private disposed = false;

  constructor(
    private readonly d: OnlineDeps,
    items: SpaManifestItem[],
  ) {
    this.items = items;
  }

  get current(): SpaManifestItem | null {
    return this.index >= 0 ? (this.items[this.index] ?? null) : null;
  }

  private set(status: OnlineStatus, message: string | null = null) {
    this.status = status;
    this.message = message;
    this.d.onChange();
  }

  private stopAudio() {
    this.d.audio.pause();
    this.d.audio.removeAttribute("src");
    this.d.audio.load();
  }

  /** Revoke playback locally (server already refuses URLs). */
  private denied() {
    this.op++;
    this.stopAudio();
    this.items = [];
    this.index = -1;
    this.set("no_access");
  }

  async playIndex(i: number): Promise<void> {
    if (this.disposed || this.status === "no_access") return;
    if (i < 0 || i >= this.items.length) return;
    const op = ++this.op;
    const item = this.items[i];
    this.index = i;
    this.stopAudio();
    this.set("loading");
    const r = await this.d.sign(item.audioItemId);
    if (op !== this.op || this.disposed) return;
    if (!r.ok) {
      if (r.reason === "no_access") return this.denied();
      this.failures++;
      if (SKIP_REASONS.has(r.reason) && this.failures < this.items.length) return this.next();
      return this.set("error", "Не удалось получить трек. Проверьте интернет и нажмите «Играть».");
    }
    this.d.audio.src = r.data.url;
    try {
      await this.d.audio.play();
      if (op !== this.op || this.disposed) return;
      this.failures = 0;
      this.set("playing");
    } catch {
      if (op !== this.op || this.disposed) return;
      // Autoplay policy (no user gesture yet) or a network/decode error.
      this.set("paused", "Нажмите «Играть», чтобы продолжить.");
    }
  }

  async toggle(): Promise<void> {
    if (this.status === "no_access" || this.items.length === 0) return;
    if (this.status === "playing" || this.status === "loading") {
      this.op++;
      this.d.audio.pause();
      return this.set("paused");
    }
    if (this.status === "paused" && this.d.audio.src) {
      const op = ++this.op;
      try {
        await this.d.audio.play();
        if (op === this.op && !this.disposed) this.set("playing");
      } catch {
        // URL may have expired while paused: fetch a fresh one (re-checks access).
        if (op === this.op && !this.disposed) await this.playIndex(Math.max(this.index, 0));
      }
      return;
    }
    return this.playIndex(Math.max(this.index, 0));
  }

  next(): Promise<void> {
    if (this.items.length === 0) return Promise.resolve();
    return this.playIndex(this.index < 0 || this.index >= this.items.length - 1 ? 0 : this.index + 1);
  }

  /** <audio> "ended": continue with the next track (program loops). */
  onEnded(): Promise<void> {
    if (this.status !== "playing") return Promise.resolve();
    return this.next();
  }

  /** <audio> "error" while playing (e.g. signed URL expired mid-stream): re-sign and retry once per track. */
  onError(): Promise<void> {
    if (this.status !== "playing" && this.status !== "loading") return Promise.resolve();
    this.failures++;
    if (this.failures > 2) {
      this.op++;
      this.stopAudio();
      this.set("error", "Ошибка воспроизведения. Проверьте интернет и нажмите «Играть».");
      return Promise.resolve();
    }
    return this.playIndex(Math.max(this.index, 0));
  }

  /**
   * New manifest from the server. null = access revoked → stop now. A playing track that
   * left the manifest is stopped and the next allowed one starts.
   */
  async applyManifest(items: SpaManifestItem[] | null): Promise<void> {
    if (this.disposed) return;
    if (items === null) return this.denied();
    const currentId = this.current?.audioItemId ?? null;
    const wasActive = this.status === "playing" || this.status === "loading";
    this.items = items;
    const idx = currentId ? items.findIndex((i) => i.audioItemId === currentId) : -1;
    if (idx >= 0) {
      this.index = idx;
      this.d.onChange();
      return;
    }
    if (currentId === null) {
      this.d.onChange();
      return;
    }
    this.op++;
    this.stopAudio();
    this.index = -1;
    if (wasActive && items.length > 0) return this.playIndex(0);
    this.set("idle");
  }

  dispose() {
    this.disposed = true;
    this.op++;
    this.d.audio.pause();
  }
}
