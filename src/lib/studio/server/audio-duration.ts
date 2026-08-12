import "server-only";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXTENSIONS: Record<string, string> = {
  "audio/aac": "aac",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

export async function probeStudioAudioDuration(
  file: File,
  mimeType: string,
): Promise<number | null> {
  const extension = EXTENSIONS[mimeType];
  if (!extension) return null;
  const path = join(tmpdir(), `audiolad-studio-${randomUUID()}.${extension}`);
  try {
    await writeFile(path, Buffer.from(await file.arrayBuffer()));
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", path,
    ]);
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  } finally {
    await unlink(path).catch(() => undefined);
  }
}
