import { studioPeaksColumnCount } from "./limits";

export const STUDIO_PEAKS_VERSION = 1 as const;

export type StudioPeaksV1 = {
  version: typeof STUDIO_PEAKS_VERSION;
  columns: number;
  minimums: Float32Array;
  maximums: Float32Array;
};

export function encodeStudioPeaksV1(
  minimums: ArrayLike<number>,
  maximums: ArrayLike<number>,
): Uint8Array {
  const columns = Math.min(minimums.length, maximums.length);
  const bytes = new Uint8Array(columns * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < columns; index += 1) {
    view.setInt16(index * 4, floatToInt16(minimums[index] ?? 0), true);
    view.setInt16(index * 4 + 2, floatToInt16(maximums[index] ?? 0), true);
  }
  return bytes;
}

export function decodeStudioPeaksV1(
  bytes: ArrayBuffer | Uint8Array,
  columns = Math.floor((bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength) / 4),
): StudioPeaksV1 {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const safeColumns = Math.max(0, Math.min(columns, Math.floor(source.byteLength / 4)));
  const view = new DataView(source.buffer, source.byteOffset, safeColumns * 4);
  const minimums = new Float32Array(safeColumns);
  const maximums = new Float32Array(safeColumns);
  for (let index = 0; index < safeColumns; index += 1) {
    minimums[index] = view.getInt16(index * 4, true) / 32_767;
    maximums[index] = view.getInt16(index * 4 + 2, true) / 32_767;
  }
  return {
    version: STUDIO_PEAKS_VERSION,
    columns: safeColumns,
    minimums,
    maximums,
  };
}

export function accumulateStudioPeaksFromInt16(
  samples: Int16Array,
  columns: number,
  sampleRate: number,
  durationSeconds: number,
): { minimums: Int16Array; maximums: Int16Array } {
  const safeColumns = studioPeaksColumnCount(durationSeconds) && columns > 0
    ? Math.max(1, Math.floor(columns))
    : 1;
  const totalSamples = Math.max(
    1,
    Math.round(Math.max(durationSeconds, samples.length / Math.max(sampleRate, 1)) * sampleRate),
  );
  const minimums = new Int16Array(safeColumns);
  const maximums = new Int16Array(safeColumns);
  minimums.fill(32_767);
  maximums.fill(-32_768);

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const column = Math.min(
      safeColumns - 1,
      Math.floor((sampleIndex / totalSamples) * safeColumns),
    );
    const sample = samples[sampleIndex] ?? 0;
    if (sample < minimums[column]!) minimums[column] = sample;
    if (sample > maximums[column]!) maximums[column] = sample;
  }

  for (let column = 0; column < safeColumns; column += 1) {
    if (minimums[column] === 32_767 && maximums[column] === -32_768) {
      minimums[column] = 0;
      maximums[column] = 0;
    }
  }
  return { minimums, maximums };
}

export function interleavedInt16PeaksToBytes(
  minimums: Int16Array,
  maximums: Int16Array,
): Uint8Array {
  const columns = Math.min(minimums.length, maximums.length);
  const bytes = new Uint8Array(columns * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < columns; index += 1) {
    view.setInt16(index * 4, minimums[index] ?? 0, true);
    view.setInt16(index * 4 + 2, maximums[index] ?? 0, true);
  }
  return bytes;
}

function floatToInt16(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-32_768, Math.min(32_767, Math.round(value * 32_767)));
}
