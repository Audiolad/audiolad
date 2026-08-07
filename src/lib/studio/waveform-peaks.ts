export type WaveformBuffer = Pick<AudioBuffer, "numberOfChannels" | "length" | "getChannelData">;

export type WaveformPeaks = {
  minimums: Float32Array;
  maximums: Float32Array;
};

const waveformPeakCache = new WeakMap<WaveformBuffer, Map<number, WaveformPeaks>>();

export function getWaveformPeaks(
  buffer: WaveformBuffer,
  columns: number,
): WaveformPeaks {
  const safeColumns = Math.max(1, Math.floor(columns));
  const minimums = new Float32Array(safeColumns);
  const maximums = new Float32Array(safeColumns);
  const samplesPerColumn = buffer.length / safeColumns;

  for (let column = 0; column < safeColumns; column += 1) {
    const start = Math.floor(column * samplesPerColumn);
    const end = Math.min(buffer.length, Math.ceil((column + 1) * samplesPerColumn));
    let minimum = 0;
    let maximum = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const sample = samples[sampleIndex] ?? 0;
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
      }
    }

    minimums[column] = minimum;
    maximums[column] = maximum;
  }

  return { minimums, maximums };
}

export function getCachedWaveformPeaks(
  buffer: WaveformBuffer,
  columns: number,
): WaveformPeaks {
  const safeColumns = Math.max(1, Math.floor(columns));
  const cacheForBuffer = waveformPeakCache.get(buffer) ?? new Map();
  waveformPeakCache.set(buffer, cacheForBuffer);
  const cached = cacheForBuffer.get(safeColumns);
  if (cached) {
    return cached;
  }

  const peaks = getWaveformPeaks(buffer, safeColumns);
  cacheForBuffer.set(safeColumns, peaks);
  return peaks;
}
