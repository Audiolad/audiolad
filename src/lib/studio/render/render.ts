import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildStudioRenderFilterGraph, studioRenderFfmpegOutputArgs } from "./ffmpeg";
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

function run(binary: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`${binary} exited with ${code ?? "unknown"}: ${stderr}`));
    });
  });
}

async function probeDuration(path: string, ffprobePath = "ffprobe"): Promise<number> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${ffprobePath} exited with ${code ?? "unknown"}: ${stderr}`));
    });
  });
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
async function renderStudioProject(
  input: StudioRenderInput,
  options: {
    renderId: string;
    outputDirectory: string;
    ffmpegPath?: string;
    format: "mp3" | "wav";
  },
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
      ...graph.assetInputPaths.flatMap((path) => ["-i", path]),
      ...irPaths.flatMap((path) => ["-i", path]),
      "-filter_complex", graph.filterComplex,
      ...(options.format === "mp3"
        ? studioRenderFfmpegOutputArgs(outputPath)
        : ["-map", "[out]", "-c:a", "pcm_f32le", "-ar", "44100", "-ac", "2", "-y", outputPath]),
    ];
    const stderr = await run(ffmpegPath, args);
    const output = await stat(outputPath);
    const actualDurationSeconds = await probeDuration(outputPath);
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
  options: { renderId: string; outputDirectory: string; ffmpegPath?: string },
): Promise<StudioRenderResult> {
  return renderStudioProject(input, { ...options, format: "mp3" });
}

/** Test-only deterministic intermediate that uses the identical filter graph. */
export function renderStudioProjectToPcmWav(
  input: StudioRenderInput,
  options: { renderId: string; outputDirectory: string; ffmpegPath?: string },
): Promise<StudioRenderResult> {
  return renderStudioProject(input, { ...options, format: "wav" });
}
