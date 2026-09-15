import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";

import {
  PRODUCT_AUDIO_DELIVERY_BITRATE,
  durationWithinTolerance,
} from "./contract";
import {
  isValidProductDeliveryMp3Probe,
  type ProductSourceProbe,
  validateProductSourceProbe,
  type ProductSourceValidationCode,
} from "./source-validation";
import type { ProductNormalizeSourceFormat } from "./contract";

export const PRODUCT_NORMALIZE_CHILD_TERM_GRACE_MS = 2_000;

export class ProductNormalizeAbortedError extends Error {
  readonly code = "worker_lease_lost";
  constructor() {
    super("worker_lease_lost");
    this.name = "ProductNormalizeAbortedError";
  }
}

export class ProductNormalizeOutputInvalidError extends Error {
  readonly code = "output_invalid";
  constructor(message = "output_invalid") {
    super(message);
    this.name = "ProductNormalizeOutputInvalidError";
  }
}

export class ProductNormalizeSourceInvalidError extends Error {
  readonly code: string;
  constructor(code: Exclude<ProductSourceValidationCode, "ok">) {
    super(code);
    this.name = "ProductNormalizeSourceInvalidError";
    this.code = code;
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

export async function terminateProductNormalizeChild(
  child: ChildProcess,
  graceMs = PRODUCT_NORMALIZE_CHILD_TERM_GRACE_MS,
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

export function runProductNormalizeChild(
  binary: string,
  args: readonly string[],
  options: { signal?: AbortSignal; termGraceMs?: number; captureStdout?: boolean } = {},
): Promise<string> {
  const signal = options.signal;
  const termGraceMs = options.termGraceMs ?? PRODUCT_NORMALIZE_CHILD_TERM_GRACE_MS;
  if (signal?.aborted) return Promise.reject(new ProductNormalizeAbortedError());

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
      void terminateProductNormalizeChild(child, termGraceMs);
    };
    signal?.addEventListener("abort", onAbort);
    if (options.captureStdout && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
    }
    child.once("error", (error) => {
      settle(() => reject(error));
    });
    child.once("close", (code) => {
      settle(() => {
        if (signal?.aborted) reject(new ProductNormalizeAbortedError());
        else if (code === 0) resolve(options.captureStdout ? stdout : stderr);
        else reject(new Error("normalize_failed"));
      });
    });
  });
}

export async function probeProductAudioFile(
  path: string,
  signal?: AbortSignal,
): Promise<ProductSourceProbe | null> {
  try {
    const stdout = await runProductNormalizeChild(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=format_name,duration:stream=codec_type,codec_name",
        "-of",
        "json",
        path,
      ],
      { signal, captureStdout: true },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { format_name?: string; duration?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string }>;
    };
    const streams = parsed.streams ?? [];
    const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
    const videoStreams = streams.filter((stream) => stream.codec_type === "video");
    const duration = Number.parseFloat(parsed.format?.duration ?? "");
    return {
      formatNames: (parsed.format?.format_name ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
      durationSeconds:
        Number.isFinite(duration) && duration > 0 ? duration : null,
      hasAudioStream: audioStreams.length > 0,
      hasVideoStream: videoStreams.length > 0,
      audioCodecNames: audioStreams
        .map((stream) => stream.codec_name?.trim().toLowerCase())
        .filter((codec): codec is string => Boolean(codec)),
    };
  } catch (error) {
    if (error instanceof ProductNormalizeAbortedError) throw error;
    return null;
  }
}

export async function assertValidProductSourceFile(
  path: string,
  format: ProductNormalizeSourceFormat,
  signal?: AbortSignal,
): Promise<{ durationSeconds: number }> {
  const probe = await probeProductAudioFile(path, signal);
  const code = validateProductSourceProbe(format, probe);
  if (code !== "ok" || !probe?.durationSeconds) {
    throw new ProductNormalizeSourceInvalidError(
      code === "ok" ? "invalid_duration" : code,
    );
  }
  return { durationSeconds: probe.durationSeconds };
}

export async function normalizeProductSourceToMp3(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<void> {
  await runProductNormalizeChild(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:a:0",
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      PRODUCT_AUDIO_DELIVERY_BITRATE,
      outputPath,
    ],
    { signal },
  );
}

export async function validateProductDeliveryMp3File(
  outputPath: string,
  sourceDurationSeconds: number,
  signal?: AbortSignal,
): Promise<{ sizeBytes: number; durationSeconds: number }> {
  const info = await stat(outputPath);
  if (info.size <= 0) throw new ProductNormalizeOutputInvalidError();
  const probe = await probeProductAudioFile(outputPath, signal);
  if (
    !isValidProductDeliveryMp3Probe(
      probe,
      sourceDurationSeconds,
      durationWithinTolerance,
    ) ||
    !probe?.durationSeconds
  ) {
    throw new ProductNormalizeOutputInvalidError();
  }
  return {
    sizeBytes: info.size,
    durationSeconds: probe.durationSeconds,
  };
}
