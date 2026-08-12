import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStudioVoicePresetImpulseWav } from "../src/lib/studio/render/ir";

function createStereoToneWav(durationSeconds: number): Buffer {
  const sampleRate = 44_100;
  const samples = new Float32Array(Math.round(durationSeconds * sampleRate) * 2);
  for (let index = 0; index < samples.length / 2; index += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.25;
    samples[index * 2] = sample;
    samples[index * 2 + 1] = sample;
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2 * 4, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

function execute(args: string[]) {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

function probe(path: string) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-show_entries", "stream=duration,nb_read_frames,nb_read_samples,sample_rate,channels,sample_fmt:format=duration,size", "-of", "json", path],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "audiolad-afir-repro-"));
  try {
    const mainPath = join(root, "main.wav");
    const irPath = join(root, "ir.wav");
    const paddedIrPath = join(root, "ir-zero-padded.wav");
    await writeFile(mainPath, createStereoToneWav(2));
    await writeFile(irPath, createStudioVoicePresetImpulseWav("focus"));
    await writeFile(paddedIrPath, createStudioVoicePresetImpulseWav("focus", 44_100, 2.25));

    const variants: Array<{
      name: string;
      main: string;
      ir: string;
      irPath?: string;
      afir?: string;
    }> = [
      { name: "plain", main: "[0:a]", ir: "[1:a]" },
      { name: "ir-pts", main: "[0:a]", ir: "[1:a]asetpts=PTS-STARTPTS[ir]" },
      { name: "main-pts", main: "[0:a]asetpts=PTS-STARTPTS[main]", ir: "[1:a]" },
      {
        name: "ir-normalized",
        main: "[0:a]",
        ir: "[1:a]aformat=sample_rates=44100:sample_fmts=flt:channel_layouts=stereo,asetpts=PTS-STARTPTS[ir]",
      },
      {
        name: "main-normalized",
        main: "[0:a]aformat=sample_rates=44100:sample_fmts=flt:channel_layouts=stereo,asetpts=PTS-STARTPTS[main]",
        ir: "[1:a]",
      },
      {
        name: "both-normalized",
        main: "[0:a]aformat=sample_rates=44100:sample_fmts=flt:channel_layouts=stereo,asetpts=PTS-STARTPTS[main]",
        ir: "[1:a]aformat=sample_rates=44100:sample_fmts=flt:channel_layouts=stereo,asetpts=PTS-STARTPTS[ir]",
      },
      { name: "ir-zero-padded", main: "[0:a]", ir: "[1:a]" , irPath: paddedIrPath },
      { name: "main-zero-padded", main: "[0:a]apad=whole_dur=2.25[main]", ir: "[1:a]" },
      { name: "irload-init", main: "[0:a]", ir: "[1:a]", afir: "afir=dry=0:wet=1:irfmt=input:irload=init:gtype=-1" },
    ];

    const report = [];
    for (const variant of variants) {
      const output = join(root, `render-${variant.name}.wav`);
      const mainLabel = variant.main.includes("[main]") ? "[main]" : "[0:a]";
      const irLabel = variant.ir.includes("[ir]") ? "[ir]" : "[1:a]";
      const setup = [variant.main.includes("[main]") ? variant.main : "", variant.ir.includes("[ir]") ? variant.ir : ""].filter(Boolean);
      const graph = [...setup, `${mainLabel}${irLabel}${variant.afir ?? "afir=dry=0:wet=1:irfmt=input:gtype=-1"}[out]`].join(";");
      const args = ["-hide_banner", "-y", "-i", mainPath, "-i", variant.irPath ?? irPath, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_f32le", output];
      try {
        execute(args);
        report.push({ name: variant.name, command: ["ffmpeg", ...args], result: probe(output), sha256: (await readFile(output)).subarray(44, 48).toString("hex") });
      } catch (error) {
        report.push({ name: variant.name, command: ["ffmpeg", ...args], error: String(error) });
      }
    }
    console.log(JSON.stringify({ root, input: { main: probe(mainPath), ir: probe(irPath), paddedIr: probe(paddedIrPath) }, report }, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
