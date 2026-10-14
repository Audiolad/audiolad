/** Evidence from the audio element, independent of play() promises or track duration. */
export type SpaPlaybackState = "playing" | "paused" | "stopped" | "error";
export type SpaLiveReport = {
  state: SpaPlaybackState;
  audioItemId: string | null;
  playingConfirmed: boolean;
  errorCode: string | null;
};

export function isSpaLiveReport(value: unknown): value is SpaLiveReport {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.state === "string" && ["playing", "paused", "stopped", "error"].includes(r.state)
    && (r.audioItemId === null || (typeof r.audioItemId === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.audioItemId)))
    && typeof r.playingConfirmed === "boolean"
    && (!r.playingConfirmed || (r.state === "playing" && r.audioItemId !== null))
    && (r.errorCode === null || (typeof r.errorCode === "string" && r.errorCode.length >= 1 && r.errorCode.length <= 80));
}

export class SpaLiveEvidence {
  private playing = false;
  private previousTime = 0;
  private reportedTime = 0;
  private lastAdvanceAt = -Infinity;

  reset(currentTime = 0) {
    this.playing = false;
    this.previousTime = this.reportedTime = currentTime;
    this.lastAdvanceAt = -Infinity;
  }

  onPlaying(currentTime: number) {
    this.reset(currentTime);
    this.playing = true;
  }

  onTimeUpdate(currentTime: number, nowMs: number) {
    if (!Number.isFinite(currentTime)) return;
    if (this.playing && currentTime > this.previousTime) this.lastAdvanceAt = nowMs;
    this.previousTime = currentTime;
  }

  report(state: SpaPlaybackState, audioItemId: string | null, nowMs: number): SpaLiveReport {
    const playingConfirmed = state === "playing" && audioItemId !== null && this.playing
      && this.previousTime > this.reportedTime && nowMs - this.lastAdvanceAt <= 5000;
    this.reportedTime = this.previousTime;
    return { state, audioItemId, playingConfirmed, errorCode: state === "error" ? "playback_failed" : null };
  }
}

/** Reporting is best effort; even a synchronous failure must not reach the player. */
export function sendSpaLiveReport(send: (report: SpaLiveReport) => Promise<unknown>, report: SpaLiveReport): void {
  try { void send(report).catch(() => {}); } catch { /* Playback continues. */ }
}
