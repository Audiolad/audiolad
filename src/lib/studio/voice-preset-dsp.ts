export type StudioVoicePreset = "none" | "focus" | "depth" | "trance";
export type StudioLegacyVoicePreset = "clean" | "warm" | "deep" | "space";

type StudioBiquadConfig = {
  type: BiquadFilterType;
  frequency: number;
  gain?: number;
  q: number;
};

type StudioReverbConfig = {
  dryGain: number;
  wetGain: number;
  wetHighPassFrequency: number;
  wetLowPassFrequency: number;
  impulseDurationSeconds: number;
  impulseDecaySeconds: number;
  leftSeed: number;
  rightSeed: number;
  normalize: false;
};

export type StudioVoicePresetDspConfig = {
  filters: readonly StudioBiquadConfig[];
  reverb: StudioReverbConfig | null;
};

/**
 * Canonical, render-reusable DSP contract for Studio voice presets.
 * `none` is deliberately a dry bypass; every other preset uses filtered
 * convolution only (no delay, feedback, compressor, or pitch processing).
 */
export const STUDIO_VOICE_PRESET_CONFIG: Record<
  StudioVoicePreset,
  StudioVoicePresetDspConfig
> = {
  none: {
    filters: [],
    reverb: null,
  },
  focus: {
    filters: [
      { type: "highpass", frequency: 75, q: 1 },
      { type: "peaking", frequency: 180, gain: 0.75, q: 0.7 },
      { type: "peaking", frequency: 2800, gain: 1.75, q: 0.8 },
    ],
    reverb: {
      dryGain: 1,
      wetGain: 0.02,
      wetHighPassFrequency: 160,
      wetLowPassFrequency: 6500,
      impulseDurationSeconds: 0.25,
      impulseDecaySeconds: 0.13,
      leftSeed: 0x6d2b79f5,
      rightSeed: 0x1b873593,
      normalize: false,
    },
  },
  depth: {
    filters: [
      { type: "highpass", frequency: 65, q: 1 },
      { type: "lowshelf", frequency: 140, gain: 3.5, q: 1 },
      { type: "peaking", frequency: 300, gain: 1.75, q: 0.9 },
      { type: "highshelf", frequency: 5000, gain: -1.5, q: 1 },
    ],
    reverb: {
      dryGain: 1,
      wetGain: 0.05,
      wetHighPassFrequency: 150,
      wetLowPassFrequency: 5500,
      impulseDurationSeconds: 0.55,
      impulseDecaySeconds: 0.31,
      leftSeed: 0x9e3779b9,
      rightSeed: 0x85ebca6b,
      normalize: false,
    },
  },
  trance: {
    filters: [
      { type: "highpass", frequency: 58, q: 1 },
      { type: "lowshelf", frequency: 125, gain: 4.5, q: 1 },
      { type: "peaking", frequency: 270, gain: 2.5, q: 0.9 },
      { type: "highshelf", frequency: 4500, gain: -2.5, q: 1 },
    ],
    reverb: {
      dryGain: 1,
      wetGain: 0.1,
      wetHighPassFrequency: 130,
      wetLowPassFrequency: 4800,
      impulseDurationSeconds: 1,
      impulseDecaySeconds: 0.63,
      leftSeed: 0xc2b2ae35,
      rightSeed: 0x27d4eb2f,
      normalize: false,
    },
  },
};

const LEGACY_PRESET_MAP: Record<StudioLegacyVoicePreset, StudioVoicePreset> = {
  clean: "none",
  warm: "focus",
  deep: "depth",
  space: "trance",
};

const impulseCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

export function parseStudioVoicePreset(value: unknown): StudioVoicePreset | null {
  if (value === "none" || value === "focus" || value === "depth" || value === "trance") {
    return value;
  }
  if (value === "clean" || value === "warm" || value === "deep" || value === "space") {
    return LEGACY_PRESET_MAP[value];
  }
  return null;
}

function nextDeterministicRandom(seed: number): [number, number] {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  return [next, next / 0x1_0000_0000];
}

/**
 * Returns one immutable, deterministic stereo IR per AudioContext, preset,
 * and sample rate. Independent channel seeds keep the wet field decorrelated,
 * with Trance using deliberately unrelated seed values for extra width.
 */
export function getStudioVoicePresetImpulse(
  context: AudioContext,
  preset: Exclude<StudioVoicePreset, "none">,
): AudioBuffer {
  const reverb = STUDIO_VOICE_PRESET_CONFIG[preset].reverb;
  if (!reverb) {
    throw new Error(`Preset "${preset}" does not define an impulse response.`);
  }

  const cache = impulseCache.get(context) ?? new Map<string, AudioBuffer>();
  if (!impulseCache.has(context)) impulseCache.set(context, cache);
  const cacheKey = `${preset}:${context.sampleRate}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const length = Math.max(1, Math.round(context.sampleRate * reverb.impulseDurationSeconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const seeds = [reverb.leftSeed, reverb.rightSeed];

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    let seed = seeds[channel];
    for (let index = 0; index < length; index += 1) {
      const [nextSeed, random] = nextDeterministicRandom(seed);
      seed = nextSeed;
      const elapsed = index / context.sampleRate;
      samples[index] =
        (random * 2 - 1) * Math.exp(-elapsed / reverb.impulseDecaySeconds);
    }
  }

  cache.set(cacheKey, impulse);
  return impulse;
}
