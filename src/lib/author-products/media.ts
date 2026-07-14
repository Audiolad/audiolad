import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_AUDIO_BYTES, MAX_COVER_BYTES } from "./limits";

const execFileAsync = promisify(execFile);

export async function getMp3DurationSeconds(buffer: Buffer): Promise<number | null> {
  const tempPath = join(tmpdir(), `audiolad-${randomUUID()}.mp3`);

  try {
    await writeFile(tempPath, buffer);

    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      tempPath,
    ]);

    const seconds = Number.parseFloat(stdout.trim());

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }

    return Math.round(seconds);
  } catch {
    return null;
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

export function isAllowedMp3File(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();

  if (mime !== "audio/mpeg" && mime !== "audio/mp3") {
    return false;
  }

  return name.endsWith(".mp3");
}

export { MAX_AUDIO_BYTES, MAX_COVER_BYTES };

const COVER_MIME_TO_EXT: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function getCoverExtension(file: File): "jpg" | "png" | "webp" | null {
  const mime = file.type.trim().toLowerCase();
  const extension = COVER_MIME_TO_EXT[mime];

  if (!extension) {
    return null;
  }

  const name = file.name.trim().toLowerCase();

  if (
    !name.endsWith(".jpg") &&
    !name.endsWith(".jpeg") &&
    !name.endsWith(".png") &&
    !name.endsWith(".webp")
  ) {
    return null;
  }

  return extension;
}
