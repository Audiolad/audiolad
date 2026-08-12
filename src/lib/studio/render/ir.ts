import { writeFile } from "node:fs/promises";

import {
  generateStudioVoicePresetImpulseSamples,
  type StudioVoicePreset,
} from "../voice-preset-dsp";

const WAV_FORMAT_IEEE_FLOAT = 3;

function wavHeader(dataBytes: number, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(WAV_FORMAT_IEEE_FLOAT, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2 * 4, 28);
  header.writeUInt16LE(2 * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

export function createStudioVoicePresetImpulseWav(
  preset: Exclude<StudioVoicePreset, "none">,
  sampleRate = 44_100,
  minimumDurationSeconds?: number,
): Buffer {
  const [left, right] = generateStudioVoicePresetImpulseSamples(preset, sampleRate);
  // afir requires its auxiliary stream to live at least as long as the main
  // filter graph. The zero tail has no convolution energy and therefore does
  // not alter the canonical impulse response.
  const sampleCount = Math.max(left.length, Math.ceil((minimumDurationSeconds ?? 0) * sampleRate));
  const body = Buffer.alloc(sampleCount * 2 * 4);
  for (let index = 0; index < left.length; index += 1) {
    body.writeFloatLE(left[index], index * 8);
    body.writeFloatLE(right[index], index * 8 + 4);
  }
  return Buffer.concat([wavHeader(body.length, sampleRate), body]);
}

export async function writeStudioVoicePresetImpulseWav(
  path: string,
  preset: Exclude<StudioVoicePreset, "none">,
  sampleRate = 44_100,
  minimumDurationSeconds?: number,
): Promise<void> {
  await writeFile(path, createStudioVoicePresetImpulseWav(preset, sampleRate, minimumDurationSeconds));
}
