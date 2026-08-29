#!/usr/bin/env node
/**
 * ffprobe checks for personal-material audio. Generates short fixtures locally;
 * does not commit binaries.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { probePersonalMaterialAudioDuration } from "../src/lib/personal-materials/server/audio-probe.ts";

const workdir = mkdtempSync(join(tmpdir(), "audiolad-pm-audio-probe-"));

function generateFixture(filename, args) {
  const outputPath = join(workdir, filename);
  execFileSync("ffmpeg", ["-y", ...args, outputPath], {
    stdio: "ignore",
  });
  return readFileSync(outputPath);
}

try {
  const mp3Buffer = generateFixture("valid.mp3", [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:a",
    "libmp3lame",
    "-q:a",
    "9",
  ]);
  const m4aBuffer = generateFixture("valid.m4a", [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
  ]);

  const mp3Seconds = await probePersonalMaterialAudioDuration(mp3Buffer, "mp3");
  const m4aSeconds = await probePersonalMaterialAudioDuration(m4aBuffer, "m4a");

  assert.equal(typeof mp3Seconds, "number");
  assert.ok(mp3Seconds > 0, "valid mp3 has duration");
  assert.equal(typeof m4aSeconds, "number");
  assert.ok(m4aSeconds > 0, "valid m4a has duration");

  const fakeM4a = Buffer.from("this is not an m4a container");
  const fakeSeconds = await probePersonalMaterialAudioDuration(fakeM4a, "m4a");
  assert.equal(fakeSeconds, null, "unreadable m4a is rejected");

  const jpegAsM4a = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  assert.equal(await probePersonalMaterialAudioDuration(jpegAsM4a, "m4a"), null);

  const wavPath = join(workdir, "renamed.wav");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:duration=1",
      "-c:a",
      "pcm_s16le",
      wavPath,
    ],
    { stdio: "ignore" },
  );
  const wavBytes = readFileSync(wavPath);
  assert.equal(
    await probePersonalMaterialAudioDuration(wavBytes, "m4a"),
    null,
    "wav bytes named as m4a must fail container check",
  );

  assert.equal(await probePersonalMaterialAudioDuration(Buffer.alloc(0), "mp3"), null);
  assert.equal(await probePersonalMaterialAudioDuration(Buffer.alloc(0), "m4a"), null);

  console.log("personal-materials-audio-probe-unit: PASS");
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
