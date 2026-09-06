import "server-only";

import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

const EXTENSIONS: Record<string, string> = {
  "audio/aac": "aac",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

export function studioAudioTempExtension(mimeType: string): string | null {
  return EXTENSIONS[mimeType] ?? null;
}

export function studioAudioTempPath(mimeType: string): string {
  const extension = studioAudioTempExtension(mimeType) ?? "bin";
  return join(tmpdir(), `audiolad-studio-${randomUUID()}.${extension}`);
}

export async function probeStudioAudioFile(path: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", path,
    ]);
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

export async function writeStreamToTempFile(
  stream: ReadableStream<Uint8Array> | Readable,
  path: string,
): Promise<void> {
  const nodeStream = stream instanceof Readable
    ? stream
    : Readable.fromWeb(stream as import("node:stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(path));
}

export async function removeTempFile(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}

/** @deprecated Upload no longer probes a request File. Use probeStudioAudioFile. */
export async function probeStudioAudioDuration(
  file: File,
  mimeType: string,
): Promise<number | null> {
  const extension = studioAudioTempExtension(mimeType);
  if (!extension) return null;
  const path = studioAudioTempPath(mimeType);
  try {
    const stream = file.stream();
    await writeStreamToTempFile(stream, path);
    return await probeStudioAudioFile(path);
  } catch {
    return null;
  } finally {
    await removeTempFile(path);
  }
}
