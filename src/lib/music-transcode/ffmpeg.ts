import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";

import {
  MUSIC_STREAM_BITRATE,
  MUSIC_STREAM_BITRATE_MAX,
  MUSIC_STREAM_BITRATE_MIN,
  MUSIC_TRANSCODE_FFMPEG_STALL_MS,
  durationWithinTolerance,
} from "./contract";

export const MUSIC_TRANSCODE_CHILD_TERM_GRACE_MS = 2_000;

export class MusicTranscodeAbortedError extends Error {
  readonly code = "worker_lease_lost";
  constructor() {
    super("worker_lease_lost");
    this.name = "MusicTranscodeAbortedError";
  }
}

export type MusicTranscodeFfmpegStallDetails = {
  elapsedMs: number;
  lastProgressUs: number | null;
  lastOutTime: string | null;
  closeSignal: NodeJS.Signals | null;
};

export class MusicTranscodeFfmpegStalledError extends Error {
  readonly code = "ffmpeg_stalled";
  constructor(readonly details: MusicTranscodeFfmpegStallDetails) {
    super("ffmpeg_stalled");
    this.name = "MusicTranscodeFfmpegStalledError";
  }
}

export class MusicTranscodeOutputInvalidError extends Error {
  readonly code = "output_invalid";
  constructor(message = "output_invalid") {
    super(message);
    this.name = "MusicTranscodeOutputInvalidError";
  }
}

export type MusicStreamProbe = {
  formatNames: string[];
  durationSeconds: number | null;
  hasAudioStream: boolean;
  hasVideoStream: boolean;
  audioCodecNames: string[];
  bitrate: number | null;
};

function childAlreadyExited(child: ChildProcess): boolean {
  return child.exitCode != null || child.signalCode != null;
}

function waitForChildClose(child: ChildProcess): Promise<void> {
  if (childAlreadyExited(child)) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("close", () => resolve());
  });
}

export async function terminateMusicTranscodeChild(
  child: ChildProcess,
  graceMs = MUSIC_TRANSCODE_CHILD_TERM_GRACE_MS,
): Promise<void> {
  if (childAlreadyExited(child)) return;
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      waitForChildClose(child),
      new Promise<void>((resolve) => {
        graceTimer = setTimeout(resolve, graceMs);
      }),
    ]);
  } finally {
    if (graceTimer !== undefined) clearTimeout(graceTimer);
  }
  if (childAlreadyExited(child)) return;
  try {
    child.kill("SIGKILL");
  } catch {
    // The process may have exited between the check and SIGKILL.
  }
  await waitForChildClose(child);
}

type MusicTranscodeProgressState = {
  rest: string;
  outTimeUs: number | null;
  outTime: string | null;
};

function parseNonNegative(value: string): number | null {
  if (!value || value === "N/A") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOutTimeUs(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((part) => Number.isFinite(part))) return null;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1_000_000);
}

function consumeMusicTranscodeProgress(
  state: MusicTranscodeProgressState,
  chunk: string,
): Array<{ positionUs: number | null; outTime: string | null }> {
  const lines = `${state.rest}${chunk}`.split(/\r?\n/);
  state.rest = lines.pop() ?? "";
  if (state.rest.length > 65_536) state.rest = "";
  const samples: Array<{ positionUs: number | null; outTime: string | null }> = [];
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "out_time_us") state.outTimeUs = parseNonNegative(value);
    else if (key === "out_time") state.outTime = value || null;
    else if (key === "progress") {
      samples.push({
        positionUs: state.outTimeUs ?? parseOutTimeUs(state.outTime),
        outTime: state.outTime,
      });
      state.outTimeUs = null;
      state.outTime = null;
    }
  }
  return samples;
}

export function runMusicTranscodeChild(
  binary: string,
  args: readonly string[],
  options: {
    signal?: AbortSignal;
    termGraceMs?: number;
    captureStdout?: boolean;
    progress?: { stallMs?: number };
  } = {},
): Promise<string> {
  const signal = options.signal;
  const termGraceMs = options.termGraceMs ?? MUSIC_TRANSCODE_CHILD_TERM_GRACE_MS;
  const progress = options.progress;
  const stallMs = progress?.stallMs ?? MUSIC_TRANSCODE_FFMPEG_STALL_MS;
  if (signal?.aborted) return Promise.reject(new MusicTranscodeAbortedError());
  if (progress && (!Number.isFinite(stallMs) || stallMs < 1)) {
    return Promise.reject(new Error("invalid_ffmpeg_stall_ms"));
  }

  return new Promise((resolve, reject) => {
    const captureStdout = Boolean(options.captureStdout) && !progress;
    const child = spawn(binary, [...args], {
      stdio: ["ignore", captureStdout || progress ? "pipe" : "ignore", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let stopping: Promise<void> | undefined;
    const startedAt = Date.now();
    let highWaterUs: number | null = null;
    let lastProgressUs: number | null = null;
    let lastOutTime: string | null = null;
    const progressState: MusicTranscodeProgressState = {
      rest: "",
      outTimeUs: null,
      outTime: null,
    };

    const clearStallTimer = () => {
      if (stallTimer !== undefined) {
        clearTimeout(stallTimer);
        stallTimer = undefined;
      }
    };
    const stopChild = () => {
      if (!stopping) stopping = terminateMusicTranscodeChild(child, termGraceMs);
      return stopping;
    };
    const armStallTimer = () => {
      if (!progress || settled || stalled || signal?.aborted) return;
      clearStallTimer();
      stallTimer = setTimeout(() => {
        stallTimer = undefined;
        if (settled || signal?.aborted) return;
        stalled = true;
        void stopChild();
      }, stallMs);
    };
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearStallTimer();
      signal?.removeEventListener("abort", onAbort);
      finish();
    };
    const onAbort = () => {
      clearStallTimer();
      void stopChild();
    };
    signal?.addEventListener("abort", onAbort);

    if (progress) armStallTimer();
    if (captureStdout && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    } else if (progress && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        for (const sample of consumeMusicTranscodeProgress(progressState, chunk)) {
          if (sample.outTime) lastOutTime = sample.outTime;
          if (sample.positionUs != null) lastProgressUs = sample.positionUs;
          if (
            sample.positionUs != null
            && sample.positionUs > 0
            && (highWaterUs == null || sample.positionUs > highWaterUs)
          ) {
            highWaterUs = sample.positionUs;
            armStallTimer();
          }
        }
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    }
    child.once("error", (error) => {
      settle(() => reject(error));
    });
    child.once("close", (code, closeSignal) => {
      settle(() => {
        if (signal?.aborted) reject(new MusicTranscodeAbortedError());
        else if (stalled) {
          reject(new MusicTranscodeFfmpegStalledError({
            elapsedMs: Date.now() - startedAt,
            lastProgressUs,
            lastOutTime,
            closeSignal,
          }));
        } else if (code === 0) resolve(captureStdout ? stdout : stderr);
        else reject(new Error("transcode_failed"));
      });
    });
  });
}

export async function probeMusicStreamFile(
  path: string,
  signal?: AbortSignal,
): Promise<MusicStreamProbe | null> {
  try {
    const stdout = await runMusicTranscodeChild("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name,duration,bit_rate:stream=codec_type,codec_name,bit_rate",
      "-of", "json",
      path,
    ], { signal, captureStdout: true });
    const parsed = JSON.parse(stdout) as {
      format?: { format_name?: string; duration?: string; bit_rate?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string; bit_rate?: string }>;
    };
    const streams = parsed.streams ?? [];
    const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
    const videoStreams = streams.filter((stream) => stream.codec_type === "video");
    const duration = Number.parseFloat(parsed.format?.duration ?? "");
    const formatBitrate = Number.parseInt(parsed.format?.bit_rate ?? "", 10);
    const audioBitrate = Number.parseInt(audioStreams[0]?.bit_rate ?? "", 10);
    const bitrate = Number.isFinite(audioBitrate) && audioBitrate > 0
      ? audioBitrate
      : Number.isFinite(formatBitrate) && formatBitrate > 0 ? formatBitrate : null;
    return {
      formatNames: (parsed.format?.format_name ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      hasAudioStream: audioStreams.length > 0,
      hasVideoStream: videoStreams.length > 0,
      audioCodecNames: audioStreams
        .map((stream) => stream.codec_name?.trim().toLowerCase())
        .filter((codec): codec is string => Boolean(codec)),
      bitrate,
    };
  } catch (error) {
    if (error instanceof MusicTranscodeAbortedError) throw error;
    return null;
  }
}

export function isValidMusicStreamProbe(
  probe: MusicStreamProbe | null,
  sourceDurationSeconds: number,
): probe is MusicStreamProbe {
  if (!probe || !probe.durationSeconds) return false;
  const mp3Container = probe.formatNames.some((name) => name === "mp3" || name === "mp3float");
  if (!mp3Container) return false;
  if (!probe.hasAudioStream || probe.hasVideoStream) return false;
  if (!probe.audioCodecNames.includes("mp3")) return false;
  if (probe.formatNames.includes("wav") || probe.formatNames.includes("wave")) return false;
  if (!durationWithinTolerance(probe.durationSeconds, sourceDurationSeconds)) return false;
  if (probe.bitrate == null
    || probe.bitrate < MUSIC_STREAM_BITRATE_MIN
    || probe.bitrate > MUSIC_STREAM_BITRATE_MAX) {
    return false;
  }
  return true;
}

export async function transcodeWavToMp3(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<void> {
  await runMusicTranscodeChild("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-progress", "pipe:1",
    "-y",
    "-i", inputPath,
    "-map", "0:a:0",
    "-vn",
    "-c:a", "libmp3lame",
    "-b:a", MUSIC_STREAM_BITRATE,
    outputPath,
  ], { signal, progress: {} });
}

export async function validateMusicStreamFile(
  outputPath: string,
  sourceDurationSeconds: number,
  signal?: AbortSignal,
): Promise<{ sizeBytes: number; durationSeconds: number; bitrate: number | null }> {
  const info = await stat(outputPath);
  if (info.size <= 0) throw new MusicTranscodeOutputInvalidError();
  const probe = await probeMusicStreamFile(outputPath, signal);
  if (!isValidMusicStreamProbe(probe, sourceDurationSeconds) || !probe.durationSeconds) {
    throw new MusicTranscodeOutputInvalidError();
  }
  return {
    sizeBytes: info.size,
    durationSeconds: probe.durationSeconds,
    bitrate: probe.bitrate,
  };
}
