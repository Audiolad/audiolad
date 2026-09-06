import "server-only";

import { spawn } from "node:child_process";

import {
  interleavedInt16PeaksToBytes,
  STUDIO_PEAKS_VERSION,
} from "../peaks-v1";
import { studioPeaksColumnCount } from "../limits";

export type GeneratedStudioPeaksV1 = {
  version: typeof STUDIO_PEAKS_VERSION;
  columns: number;
  bytes: Uint8Array;
};

const PEAKS_SAMPLE_RATE = 8_000;

export function generateStudioPeaksV1FromInt16(
  samples: Int16Array,
  durationSeconds: number,
): GeneratedStudioPeaksV1 {
  const columns = studioPeaksColumnCount(durationSeconds);
  const minimums = new Int16Array(columns);
  const maximums = new Int16Array(columns);
  minimums.fill(32_767);
  maximums.fill(-32_768);
  const totalSamples = Math.max(samples.length, 1);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const column = Math.min(columns - 1, Math.floor((sampleIndex / totalSamples) * columns));
    const sample = samples[sampleIndex] ?? 0;
    if (sample < minimums[column]!) minimums[column] = sample;
    if (sample > maximums[column]!) maximums[column] = sample;
  }
  for (let column = 0; column < columns; column += 1) {
    if (minimums[column] === 32_767 && maximums[column] === -32_768) {
      minimums[column] = 0;
      maximums[column] = 0;
    }
  }
  return {
    version: STUDIO_PEAKS_VERSION,
    columns,
    bytes: interleavedInt16PeaksToBytes(minimums, maximums),
  };
}

export async function generateStudioPeaksV1FromFile(
  path: string,
  durationSeconds: number,
): Promise<GeneratedStudioPeaksV1 | null> {
  const columns = studioPeaksColumnCount(durationSeconds);
  const minimums = new Int16Array(columns);
  const maximums = new Int16Array(columns);
  minimums.fill(32_767);
  maximums.fill(-32_768);

  let sampleIndex = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-hide_banner",
        "-nostats",
        "-i", path,
        "-ac", "1",
        "-ar", String(PEAKS_SAMPLE_RATE),
        "-f", "s16le",
        "-acodec", "pcm_s16le",
        "pipe:1",
      ], { stdio: ["ignore", "pipe", "ignore"] });

      child.stdout.on("data", (chunk: Buffer) => {
        const aligned = chunk.byteLength - (chunk.byteLength % 2);
        for (let offset = 0; offset < aligned; offset += 2) {
          const sample = chunk.readInt16LE(offset);
          const column = Math.min(columns - 1, Math.floor((sampleIndex / Math.max(durationSeconds * PEAKS_SAMPLE_RATE, 1)) * columns));
          if (sample < minimums[column]!) minimums[column] = sample;
          if (sample > maximums[column]!) maximums[column] = sample;
          sampleIndex += 1;
        }
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg_peaks_exit_${code}`));
      });
    });
  } catch {
    return null;
  }

  if (sampleIndex === 0) return null;
  for (let column = 0; column < columns; column += 1) {
    if (minimums[column] === 32_767 && maximums[column] === -32_768) {
      minimums[column] = 0;
      maximums[column] = 0;
    }
  }
  const bytes = interleavedInt16PeaksToBytes(minimums, maximums);
  if (bytes.byteLength > 131_072) return null;
  return { version: STUDIO_PEAKS_VERSION, columns, bytes };
}
