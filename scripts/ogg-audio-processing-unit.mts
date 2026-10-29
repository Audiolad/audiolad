import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  assertValidProductSourceFile,
  normalizeProductSourceToMp3,
  probeProductAudioFile,
  validateProductDeliveryMp3File,
} from "../src/lib/product-audio-normalize/ffmpeg";
import { transcodeWavToMp3, validateMusicStreamFile } from "../src/lib/music-transcode/ffmpeg";

const execFile = promisify(execFileCallback);
let toolsAvailable = true;
try {
  await execFile("ffmpeg", ["-version"]);
  await execFile("ffprobe", ["-version"]);
} catch {
  toolsAvailable = false;
}

test("Ogg source probe and real product/music MP3 delivery", {
  skip: toolsAvailable ? false : "ffmpeg/ffprobe not installed; synthetic Ogg processing test skipped",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "audiolad-ogg-test-"));
  try {
    for (const codec of ["libopus", "libvorbis"]) {
      const source = join(directory, `${codec}.ogg`);
      const output = join(directory, `${codec}.mp3`);
      await execFile("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=48000", "-ac", "1", "-c:a", codec, "-b:a", codec === "libopus" ? "24k" : "64k", source]);
      const inspected = await assertValidProductSourceFile(source, "ogg");
      assert.ok(Math.abs(inspected.durationSeconds - 2) < 0.1);
      await normalizeProductSourceToMp3(source, output);
      const delivery = await validateProductDeliveryMp3File(output, inspected.durationSeconds);
      assert.ok(Math.abs(delivery.durationSeconds - 2) < 0.15);
      assert.deepEqual((await probeProductAudioFile(output))?.audioCodecNames, ["mp3"]);
      const renamed = join(directory, `${codec}-fake.ogg`);
      await copyFile(output, renamed);
      await assert.rejects(() => assertValidProductSourceFile(renamed, "ogg"), { code: "container_mismatch" });
      const music = join(directory, `${codec}-music.mp3`);
      await transcodeWavToMp3(source, music);
      assert.ok((await validateMusicStreamFile(music, 2)).durationSeconds > 1.9);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
