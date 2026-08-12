import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStudioVoicePresetImpulseWav } from "../src/lib/studio/render/ir";

const RATE = 44_100;

function wav(samples: Float32Array): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22); header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 8, 28);
  header.writeUInt16LE(8, 32); header.writeUInt16LE(32, 34); header.write("data", 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

function samples(file: Buffer): Float32Array {
  const offset = file.indexOf("data") + 8;
  const length = file.readUInt32LE(offset - 4);
  return new Float32Array(Uint8Array.from(file.subarray(offset, offset + length)).buffer);
}

function stats(values: Float32Array, channel: number) {
  let peak = 0; let sum = 0; let first = -1; let last = -1;
  for (let index = channel; index < values.length; index += 2) {
    const value = values[index];
    peak = Math.max(peak, Math.abs(value)); sum += value * value;
    if (value !== 0 && first < 0) first = (index - channel) / 2;
    if (value !== 0) last = (index - channel) / 2;
  }
  return { peak, rms: Math.sqrt(sum / (values.length / 2)), first, last };
}

function convolve(main: string, ir: string, output: string, reverse = false, options = "dry=0:wet=1:irfmt=input:gtype=-1:irload=init") {
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-y", "-i", main, "-i", ir,
    "-filter_complex", `${reverse ? "[1:a][0:a]" : "[0:a][1:a]"}afir=${options}[out]`,
    "-map", "[out]", "-c:a", "pcm_f32le", output,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stderr;
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "audiolad-afir-wet-"));
  try {
    const input = new Float32Array(RATE * 2 * 2);
    input[0] = 1; input[1] = 1;
    const knownIr = new Float32Array(Math.round(RATE * 0.25) * 2);
    knownIr[0] = 1; knownIr[1] = 1;
    knownIr[2000] = 0.5; knownIr[2001] = 0.5;
    const mainPath = join(root, "impulse.wav");
    const canonicalIrPath = join(root, "focus-ir.wav");
    const knownIrPath = join(root, "known-ir.wav");
    await writeFile(mainPath, wav(input));
    await writeFile(canonicalIrPath, createStudioVoicePresetImpulseWav("focus"));
    await writeFile(knownIrPath, wav(knownIr));

    const report: Record<string, unknown> = {};
    for (const [name, ir] of [["focus", canonicalIrPath], ["known", knownIrPath]] as const) {
      const output = join(root, `${name}-wet.wav`);
      const stderr = convolve(mainPath, ir, output);
      const pcm = samples(await readFile(output));
      report[name] = {
        output: { frames: pcm.length / 2, left: stats(pcm, 0), right: stats(pcm, 1), sha256: createHash("sha256").update(Buffer.from(pcm.buffer)).digest("hex") },
        stderr,
      };
    }
    const reversed = join(root, "reversed-known-wet.wav");
    convolve(mainPath, knownIrPath, reversed, true);
    const reversedPcm = samples(await readFile(reversed));
    report.reversedKnown = { frames: reversedPcm.length / 2, left: stats(reversedPcm, 0), right: stats(reversedPcm, 1) };
    const dryOne = join(root, "known-dry-one.wav");
    convolve(mainPath, knownIrPath, dryOne, false, "dry=1:wet=1:irfmt=input:gtype=-1:irload=init");
    const dryOnePcm = samples(await readFile(dryOne));
    report.knownDryOne = { frames: dryOnePcm.length / 2, left: stats(dryOnePcm, 0), right: stats(dryOnePcm, 1) };
    const dryOnly = join(root, "known-dry-only.wav");
    convolve(mainPath, knownIrPath, dryOnly, false, "dry=1:wet=0:irfmt=input:gtype=-1:irload=init");
    const dryOnlyPcm = samples(await readFile(dryOnly));
    report.knownDryOnly = { frames: dryOnlyPcm.length / 2, left: stats(dryOnlyPcm, 0), right: stats(dryOnlyPcm, 1) };
    const focus = samples(await readFile(canonicalIrPath));
    report.focusIr = {
      frames: focus.length / 2, duration: focus.length / 2 / RATE,
      left: stats(focus, 0), right: stats(focus, 1),
      sha256: createHash("sha256").update(Buffer.from(focus.buffer)).digest("hex"),
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
