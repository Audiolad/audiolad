import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PersonalMaterialAudioExtension } from "@/lib/personal-materials/audio-format";
import { isPersonalMaterialAudioExtension } from "@/lib/personal-materials/audio-format";

const execFileAsync = promisify(execFile);

type FfprobeOutput = {
  format?: {
    duration?: string;
    format_name?: string;
  };
  streams?: Array<{
    codec_type?: string;
    duration?: string;
  }>;
};

const MP4_FAMILY_FORMAT_TOKENS = new Set([
  "mp4",
  "m4a",
  "mov",
  "3gp",
  "3g2",
  "mj2",
  "ipod",
  "ismv",
  "isma",
]);

function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number.parseFloat(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Math.round(seconds);
}

function hasAudioStream(output: FfprobeOutput): boolean {
  return (output.streams ?? []).some((stream) => stream.codec_type === "audio");
}

function isMp4FamilyFormatName(formatName: string | undefined): boolean {
  if (!formatName) {
    return false;
  }

  return formatName
    .toLowerCase()
    .split(",")
    .map((token) => token.trim())
    .some((token) => MP4_FAMILY_FORMAT_TOKENS.has(token));
}

function resolveProbeDuration(output: FfprobeOutput): number | null {
  const formatDuration = parseDurationSeconds(output.format?.duration);

  if (formatDuration) {
    return formatDuration;
  }

  for (const stream of output.streams ?? []) {
    const streamDuration = parseDurationSeconds(stream.duration);

    if (streamDuration) {
      return streamDuration;
    }
  }

  return null;
}

/**
 * Probe duration with ffprobe using the validated extension.
 * Does not transcode. Returns null when the file is unreadable,
 * has no audio stream, has no positive duration, or (for M4A)
 * is not an MP4/M4A-compatible container.
 */
export async function probePersonalMaterialAudioDuration(
  buffer: Buffer,
  extension: PersonalMaterialAudioExtension,
): Promise<number | null> {
  if (!isPersonalMaterialAudioExtension(extension)) {
    return null;
  }

  const tempPath = join(tmpdir(), `audiolad-pm-${randomUUID()}.${extension}`);

  try {
    await writeFile(tempPath, buffer);

    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name",
        "-show_entries",
        "stream=codec_type,duration",
        "-of",
        "json",
        tempPath,
      ],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );

    const output = JSON.parse(stdout) as FfprobeOutput;

    if (!hasAudioStream(output)) {
      return null;
    }

    if (extension === "m4a" && !isMp4FamilyFormatName(output.format?.format_name)) {
      return null;
    }

    return resolveProbeDuration(output);
  } catch {
    return null;
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
