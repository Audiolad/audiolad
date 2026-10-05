import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";

import {
  PRODUCT_VIDEO_EXPORT_STALL_MS,
  PRODUCT_VIDEO_ORIENTATION_META,
  type ProductVideoOrientation,
} from "./contract";

const TERM_GRACE_MS = 2_000;

export class ProductVideoRenderAbortedError extends Error {
  readonly code = "worker_lease_lost";
  constructor() {
    super("worker_lease_lost");
    this.name = "ProductVideoRenderAbortedError";
  }
}

export class ProductVideoRenderStalledError extends Error {
  readonly code = "ffmpeg_stalled";
  constructor() {
    super("ffmpeg_stalled");
    this.name = "ProductVideoRenderStalledError";
  }
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return;
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  await Promise.race([
    new Promise<void>((resolve) => child.once("close", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, TERM_GRACE_MS)),
  ]);
  if (child.exitCode != null || child.signalCode != null) return;
  try {
    child.kill("SIGKILL");
  } catch {
    return;
  }
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
}

export async function renderProductVideo(params: {
  audioPath: string;
  coverPath: string;
  outputPath: string;
  orientation: ProductVideoOrientation;
  signal?: AbortSignal;
}): Promise<{ sizeBytes: number }> {
  const { audioPath, coverPath, outputPath, orientation, signal } = params;
  if (signal?.aborted) throw new ProductVideoRenderAbortedError();

  const meta = PRODUCT_VIDEO_ORIENTATION_META[orientation];
  const filter =
    `scale=${meta.width}:${meta.height}:force_original_aspect_ratio=increase,` +
    `crop=${meta.width}:${meta.height},format=yuv420p`;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-framerate",
        "25",
        "-i",
        coverPath,
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-tune",
        "stillimage",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "25",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-nostats",
        outputPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let settled = false;
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        stalled = true;
        void terminate(child);
      }, PRODUCT_VIDEO_EXPORT_STALL_MS);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      void terminate(child);
    };

    signal?.addEventListener("abort", onAbort);
    arm();
    child.stdout?.on("data", arm);
    child.stderr?.on("data", arm);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      finish(() => {
        if (signal?.aborted) reject(new ProductVideoRenderAbortedError());
        else if (stalled) reject(new ProductVideoRenderStalledError());
        else if (code === 0) resolve();
        else reject(new Error("ffmpeg_failed"));
      });
    });
  });

  const info = await stat(outputPath);
  if (info.size <= 0) throw new Error("output_invalid");
  return { sizeBytes: info.size };
}
