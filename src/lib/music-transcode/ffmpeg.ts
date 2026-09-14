import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";

import {
  MUSIC_STREAM_BITRATE,
  MUSIC_STREAM_BITRATE_MAX,
  MUSIC_STREAM_BITRATE_MIN,
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
  await Promise.race([
    waitForChildClose(child),
    new Promise<void>((resolve) => {
      setTimeout(resolve, graceMs);
    }),
  ]);
  if (childAlreadyExited(child)) return;
  try {
    child.kill("SIGKILL");
  } catch {
    return;
  }
  await waitForChildClose(child);
}

export function runMusicTranscodeChild(
  binary: string,
  args: readonly string[],
  options: { signal?: AbortSignal; termGraceMs?: number; captureStdout?: boolean } = {},
): Promise<string> {
  const signal = options.signal;
  const termGraceMs = options.termGraceMs ?? MUSIC_TRANSCODE_CHILD_TERM_GRACE_MS;
  if (signal?.aborted) return Promise.reject(new MusicTranscodeAbortedError());

  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], {
      stdio: ["ignore", options.captureStdout ? "pipe" : "ignore", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      finish();
    };
    const onAbort = () => {
      void terminateMusicTranscodeChild(child, termGraceMs);
    };
    signal?.addEventListener("abort", onAbort);
    if (options.captureStdout && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    }
    child.once("error", (error) => {
      settle(() => reject(error));
    });
    child.once("close", (code) => {
      settle(() => {
        if (signal?.aborted) reject(new MusicTranscodeAbortedError());
        else if (code === 0) resolve(options.captureStdout ? stdout : stderr);
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
    "-y",
    "-i", inputPath,
    "-map", "0:a:0",
    "-vn",
    "-c:a", "libmp3lame",
    "-b:a", MUSIC_STREAM_BITRATE,
    outputPath,
  ], { signal });
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
