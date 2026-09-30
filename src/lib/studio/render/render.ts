import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildStudioRenderFilterGraph, studioRenderFfmpegOutputArgs, studioRenderFfmpegProgressArgs } from "./ffmpeg";
import {
  consumeStudioRenderFfmpegProgress,
  createStudioRenderFfmpegProgressState,
  STUDIO_RENDER_FFMPEG_STALL_MS,
  STUDIO_RENDER_FFMPEG_STALLED_CODE,
  STUDIO_RENDER_FFMPEG_STALLED_MESSAGE,
  studioRenderFfmpegProgressAdvanced,
  type StudioRenderFfmpegProgressSample,
  type StudioRenderFfmpegStallDetails,
} from "./ffmpeg-stall";
import { writeStudioVoicePresetImpulseWav } from "./ir";
import type { StudioRenderInput } from "./types";

export type StudioRenderResult = Readonly<{
  outputPath: string;
  /** @deprecated Use expectedDurationSeconds for render timeline duration. */
  durationSeconds: number;
  expectedDurationSeconds: number;
  actualDurationSeconds: number;
  durationDeltaSeconds: number;
  sizeBytes: number;
  stderr: string;
}>;

/** SIGTERM grace before SIGKILL when an AbortSignal cancels FFmpeg/ffprobe. */
export const STUDIO_RENDER_CHILD_TERM_GRACE_MS = 2_000;

export class StudioRenderChildAbortedError extends Error {
  readonly code = "studio_render_aborted";

  constructor() {
    super("studio_render_aborted");
    this.name = "StudioRenderChildAbortedError";
  }
}

export class StudioRenderFfmpegStalledError extends Error {
  readonly code = STUDIO_RENDER_FFMPEG_STALLED_CODE;
  readonly stage = "ffmpeg" as const;
  readonly safeMessage = STUDIO_RENDER_FFMPEG_STALLED_MESSAGE;

  constructor(readonly details: StudioRenderFfmpegStallDetails) {
    super(STUDIO_RENDER_FFMPEG_STALLED_CODE);
    this.name = "StudioRenderFfmpegStalledError";
  }
}

export function isStudioRenderFfmpegStalledError(
  error: unknown,
): error is StudioRenderFfmpegStalledError {
  if (error instanceof StudioRenderFfmpegStalledError) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "StudioRenderFfmpegStalledError"
    && (error as { code?: string }).code === STUDIO_RENDER_FFMPEG_STALLED_CODE;
}

export class StudioRenderDurationError extends Error {
  readonly code = "render_duration_mismatch";

  constructor(
    readonly expectedDurationSeconds: number,
    readonly actualDurationSeconds: number,
  ) {
    super(
      `Rendered audio is shorter than its timeline: expected ${expectedDurationSeconds}s, got ${actualDurationSeconds}s.`,
    );
  }
}

export async function withStudioRenderWorkspace<T>(
  renderId: string,
  action: (workspace: string) => Promise<T>,
): Promise<T> {
  const safeId = renderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "render";
  const workspace = await mkdtemp(join(tmpdir(), `audiolad-studio-${safeId}-`));
  try {
    return await action(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function childAlreadyExited(child: ChildProcess): boolean {
  return child.exitCode != null || child.signalCode != null;
}

function waitForChildClose(child: ChildProcess): Promise<void> {
  if (childAlreadyExited(child)) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("close", () => resolve());
  });
}

export async function terminateStudioRenderChild(
  child: ChildProcess,
  graceMs = STUDIO_RENDER_CHILD_TERM_GRACE_MS,
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
    // The pid may already be gone; still wait so callers observe close.
  }
  await waitForChildClose(child);
}

export function runStudioRenderChild(
  binary: string,
  args: readonly string[],
  options: {
    signal?: AbortSignal;
    termGraceMs?: number;
    captureStdout?: boolean;
    /**
     * FFmpeg stage only. Reads `-progress pipe:1` from stdout and aborts the
     * child when `out_time` stops growing. Omitted for ffprobe and other tools.
     */
    progress?: {
      stallMs?: number;
      expectedDurationSeconds: number;
    };
  } = {},
): Promise<string> {
  const signal = options.signal;
  const termGraceMs = options.termGraceMs ?? STUDIO_RENDER_CHILD_TERM_GRACE_MS;
  const progress = options.progress;
  const stallMs = progress?.stallMs ?? STUDIO_RENDER_FFMPEG_STALL_MS;
  if (signal?.aborted) return Promise.reject(new StudioRenderChildAbortedError());
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
    const progressState = createStudioRenderFfmpegProgressState();

    const clearStallTimer = () => {
      if (stallTimer !== undefined) {
        clearTimeout(stallTimer);
        stallTimer = undefined;
      }
    };
    const stopChild = () => {
      if (!stopping) stopping = terminateStudioRenderChild(child, termGraceMs);
      return stopping;
    };
    const armStallTimer = () => {
      if (!progress || settled || signal?.aborted || stalled) return;
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
    const noteSample = (sample: StudioRenderFfmpegProgressSample) => {
      if (settled || signal?.aborted || stalled) return;
      if (sample.outTime) lastOutTime = sample.outTime;
      if (sample.positionUs != null) lastProgressUs = sample.positionUs;
      if (
        sample.positionUs != null
        && studioRenderFfmpegProgressAdvanced(highWaterUs, sample.positionUs)
      ) {
        highWaterUs = sample.positionUs;
        armStallTimer();
      }
    };

    signal?.addEventListener("abort", onAbort);
    if (progress) armStallTimer();
    if (captureStdout && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    } else if (progress && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        for (const sample of consumeStudioRenderFfmpegProgress(progressState, chunk)) {
          noteSample(sample);
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
    child.once("close", (code, killSignal) => {
      settle(() => {
        if (signal?.aborted) reject(new StudioRenderChildAbortedError());
        else if (stalled) {
          reject(new StudioRenderFfmpegStalledError({
            elapsedMs: Date.now() - startedAt,
            lastProgressUs,
            lastOutTime,
            expectedDurationSeconds: progress?.expectedDurationSeconds ?? null,
            closeSignal: killSignal,
          }));
        } else if (code === 0) resolve(captureStdout ? stdout : stderr);
        else reject(new Error(`${binary} exited with ${code ?? killSignal ?? "unknown"}: ${stderr}`));
      });
    });
  });
}

async function probeDuration(
  path: string,
  ffprobePath = "ffprobe",
  signal?: AbortSignal,
): Promise<number> {
  const output = await runStudioRenderChild(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ], { signal, captureStdout: true });
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned an invalid duration for ${path}.`);
  }
  return duration;
}

/** Keep tight: pads must fill geometry; do not raise to hide real shortfalls. */
export const STUDIO_RENDER_DURATION_EPSILON_SECONDS = 0.25;
const DURATION_EPSILON_SECONDS = STUDIO_RENDER_DURATION_EPSILON_SECONDS;

/**
 * Renders only local, already-authorized asset files. Callers own moving the
 * completed result to durable storage in a later job/worker phase.
 */
type StudioRenderRunOptions = {
  renderId: string;
  outputDirectory: string;
  ffmpegPath?: string;
  format: "mp3" | "wav";
  signal?: AbortSignal;
};

async function renderStudioProject(
  input: StudioRenderInput,
  options: StudioRenderRunOptions,
): Promise<StudioRenderResult> {
  const graph = buildStudioRenderFilterGraph(input);
  const outputPath = join(options.outputDirectory, `${options.renderId}.${options.format}`);
  const ffmpegPath = options.ffmpegPath ?? "ffmpeg";

  return withStudioRenderWorkspace(options.renderId, async (workspace) => {
    const irPaths = await Promise.all(graph.irPresets.map(async (preset) => {
      const path = join(workspace, `ir-${preset}-44100.wav`);
      await writeStudioVoicePresetImpulseWav(path, preset);
      return path;
    }));
    const args = [
      "-hide_banner", "-nostdin",
      ...studioRenderFfmpegProgressArgs(),
      ...graph.assetInputPaths.flatMap((path) => ["-i", path]),
      ...irPaths.flatMap((path) => ["-i", path]),
      "-filter_complex", graph.filterComplex,
      ...(options.format === "mp3"
        ? studioRenderFfmpegOutputArgs(outputPath, graph.durationSeconds)
        : ["-map", "[out]", "-c:a", "pcm_f32le", "-ar", "44100", "-ac", "2", "-y", outputPath]),
    ];
    const stderr = await runStudioRenderChild(ffmpegPath, args, {
      signal: options.signal,
      progress: { expectedDurationSeconds: graph.durationSeconds },
    });
    if (options.signal?.aborted) throw new StudioRenderChildAbortedError();
    const output = await stat(outputPath);
    const actualDurationSeconds = await probeDuration(outputPath, "ffprobe", options.signal);
    const durationDeltaSeconds = actualDurationSeconds - graph.durationSeconds;
    if (durationDeltaSeconds < -DURATION_EPSILON_SECONDS) {
      throw new StudioRenderDurationError(graph.durationSeconds, actualDurationSeconds);
    }
    return {
      outputPath,
      durationSeconds: graph.durationSeconds,
      expectedDurationSeconds: graph.durationSeconds,
      actualDurationSeconds,
      durationDeltaSeconds,
      sizeBytes: output.size,
      stderr,
    };
  });
}

export function renderStudioProjectToMp3(
  input: StudioRenderInput,
  options: { renderId: string; outputDirectory: string; ffmpegPath?: string; signal?: AbortSignal },
): Promise<StudioRenderResult> {
  return renderStudioProject(input, { ...options, format: "mp3" });
}

/** Test-only deterministic intermediate that uses the identical filter graph. */
export function renderStudioProjectToPcmWav(
  input: StudioRenderInput,
  options: { renderId: string; outputDirectory: string; ffmpegPath?: string; signal?: AbortSignal },
): Promise<StudioRenderResult> {
  return renderStudioProject(input, { ...options, format: "wav" });
}
