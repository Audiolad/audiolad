/**
 * Business SPA pilot (0e05333f): Web Audio track slot implementing the engine's AudioLike.
 *
 * Why: HTMLAudio `play()` is a main-thread call, so any JS/timer latency at a track
 * boundary becomes audible. A decoded AudioBuffer can instead be scheduled with
 * `AudioBufferSourceNode.start(when)` on the AudioContext clock, so the next track starts
 * on the exact sample where the previous one ends (`startAfter`), regardless of
 * main-thread delays or background-tab timer throttling.
 *
 * Memory: a decoded track is ~10 MB per stereo minute; only two slots exist (current +
 * prepared), and a slot's buffer is dropped as soon as its source is cleared.
 */
import type { AudioLike } from "./spa-player-engine";

type Listener = { fn: () => void; once?: boolean };

export class WebAudioTrack implements AudioLike {
  private readonly ctx: AudioContext;
  private readonly gain: GainNode;
  private _src = "";
  private buffer: AudioBuffer | null = null;
  private node: AudioBufferSourceNode | null = null;
  private startCtx = 0;
  private offset = 0;
  private playing = false;
  private token = 0;
  private listeners = new Map<string, Listener[]>();
  /** Wall-clock deadline (epoch ms) after which this slot must be silent. */
  private deadline: number | null = null;
  readyState = 0;

  private readonly wallNow: () => number;

  constructor(ctx: AudioContext, wallNow: () => number = () => Date.now()) {
    this.ctx = ctx;
    this.wallNow = wallNow;
    this.gain = ctx.createGain();
    this.gain.connect(ctx.destination);
    // The audio clock stands still while suspended: re-map the wall deadline on resume.
    // Interruption: drop the node so nothing can sound again without a JS play() call
    // (the engine resumes via playActive, which re-checks rights and deadlines). On any
    // state change a passed deadline also stops immediately.
    ctx.addEventListener?.("statechange", () => {
      if (this.ctx.state !== "running") this.pause();
      else if (this.deadline !== null && this.wallNow() >= this.deadline) this.pause();
      else this.applyStop();
    });
  }

  /** Hard stop on the audio clock at wall time `epochMs` (rights deadline). */
  stopAt(epochMs: number | null): void {
    this.deadline = epochMs;
    this.applyStop();
  }

  private applyStop(): void {
    const n = this.node;
    if (!n || this.deadline === null) return;
    const when = Math.max(this.ctx.currentTime, this.ctx.currentTime + (this.deadline - this.wallNow()) / 1000);
    try {
      n.stop(Math.max(when, this.startCtx));
    } catch {
      /* already stopped */
    }
  }

  get src(): string {
    return this._src;
  }
  set src(v: string) {
    this.stopNode();
    this.deadline = null;
    this._src = v;
    this.buffer = null;
    this.readyState = 0;
    this.offset = 0;
    this.token += 1;
  }
  get duration(): number {
    return this.buffer ? this.buffer.duration : NaN;
  }
  get paused(): boolean {
    return !this.playing;
  }
  get volume(): number {
    return this.gain.gain.value;
  }
  set volume(v: number) {
    this.gain.gain.value = v;
  }
  get currentTime(): number {
    if (!this.playing) return this.offset;
    const t = this.offset + Math.max(0, this.ctx.currentTime - this.startCtx);
    return Math.min(this.duration, t);
  }
  set currentTime(v: number) {
    const t = Math.max(0, Math.min(Number.isFinite(this.duration) ? this.duration : v, v));
    if (this.playing) {
      this.stopNode();
      this.offset = t;
      this.startNode(this.ctx.currentTime);
    } else this.offset = t;
  }

  load(): void {
    if (!this._src) return;
    const token = ++this.token;
    const src = this._src;
    void (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch_failed");
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (token !== this.token) return;
        this.buffer = buf;
        this.readyState = 4;
        this.fire("loadedmetadata");
        this.fire("canplay");
        this.fire("canplaythrough");
      } catch {
        if (token === this.token) this.fire("error");
      }
    })();
  }

  async play(): Promise<void> {
    if (!this.buffer) throw new Error("not_ready");
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (this.ctx.state !== "running") throw new Error("autoplay_blocked");
    if (this.playing) return;
    this.startNode(this.ctx.currentTime);
  }

  /** Start from 0 exactly where `prev` ends on the audio clock. False if not possible. */
  startAfter(prev: AudioLike): boolean {
    if (!(prev instanceof WebAudioTrack) || !prev.playing || !prev.buffer || !this.buffer || this.playing) return false;
    if (this.ctx.state !== "running") return false;
    const when = prev.startCtx + (prev.buffer.duration - prev.offset);
    if (when < this.ctx.currentTime + 0.01) return false;
    this.offset = 0;
    this.startNode(when);
    return true;
  }

  pause(): void {
    if (!this.playing) return;
    const t = this.currentTime;
    this.stopNode();
    this.offset = t;
  }

  removeAttribute(name: string): void {
    if (name !== "src") return;
    this.src = "";
  }

  addEventListener(type: string, fn: () => void, opts?: { once?: boolean }): void {
    const a = this.listeners.get(type) ?? [];
    a.push({ fn, once: opts?.once });
    this.listeners.set(type, a);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l.fn !== fn));
  }

  private fire(type: string): void {
    const a = this.listeners.get(type) ?? [];
    this.listeners.set(type, a.filter((l) => !l.once));
    a.forEach((l) => l.fn());
  }

  private startNode(when: number): void {
    if (!this.buffer) return;
    const node = this.ctx.createBufferSource();
    node.buffer = this.buffer;
    node.connect(this.gain);
    node.onended = () => {
      if (node !== this.node) return;
      const pos = this.currentTime;
      this.node = null;
      this.playing = false;
      // Stopped by the rights deadline: keep the real position; natural end: duration.
      this.offset = this.deadline !== null && this.wallNow() >= this.deadline - 50 ? pos : this.duration;
      this.fire("ended");
    };
    node.start(when, this.offset);
    this.node = node;
    this.startCtx = when;
    this.playing = true;
    this.applyStop();
  }

  private stopNode(): void {
    const n = this.node;
    this.node = null;
    this.playing = false;
    if (!n) return;
    n.onended = null;
    try {
      n.stop();
    } catch {
      /* not started */
    }
    n.disconnect();
  }
}
