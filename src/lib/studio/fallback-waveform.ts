import type { WaveformPeaks } from "./waveform-peaks";

export function getFallbackWaveformPeaks(
  durationSeconds: number,
  columns: number,
  seed = 1,
): WaveformPeaks {
  const safeColumns = Math.max(1, Math.floor(columns));
  const minimums = new Float32Array(safeColumns);
  const maximums = new Float32Array(safeColumns);
  const safeDuration =
    Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 1;
  let state = (Math.imul(seed || 1, 0x9e3779b9) ^ Math.floor(safeDuration * 1000)) >>> 0;

  for (let column = 0; column < safeColumns; column += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const envelope = 0.16 + 0.28 * Math.sin((column / safeColumns) * Math.PI);
    const magnitude = ((state & 0xffff) / 0xffff) * envelope;
    maximums[column] = magnitude;
    minimums[column] = -magnitude * 0.85;
  }

  return { minimums, maximums };
}
