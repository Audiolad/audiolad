import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  assertValidProductSourceFile,
  normalizeProductSourceToMp3,
  probeProductAudioFile,
  validateProductDeliveryMp3File,
  ProductNormalizeSourceInvalidError,
} from "../src/lib/product-audio-normalize/ffmpeg";
import { validateProductSourceProbe } from "../src/lib/product-audio-normalize/source-validation";

const execFile = promisify(execFileCallback);
const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "audiolad-product-normalize-"));

try {
  const m4aPath = path.join(fixtureDirectory, "source.m4a");
  const aacPath = path.join(fixtureDirectory, "source.aac");
  const wavAsM4a = path.join(fixtureDirectory, "fake.m4a");
  const emptyPath = path.join(fixtureDirectory, "empty.m4a");
  const junkPath = path.join(fixtureDirectory, "junk.m4a");
  const jpegPath = path.join(fixtureDirectory, "pic.m4a");
  const videoPath = path.join(fixtureDirectory, "video.mp4");
  const outFromM4a = path.join(fixtureDirectory, "from-m4a.mp3");
  const outFromAac = path.join(fixtureDirectory, "from-aac.mp3");

  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "1.5", "-c:a", "aac", "-b:a", "128k", m4aPath,
  ]);
  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "1.2", "-c:a", "aac", "-b:a", "128k", "-f", "adts", aacPath,
  ]);
  const wavPath = path.join(fixtureDirectory, "source.wav");
  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "1", "-c:a", "pcm_s16le", wavPath,
  ]);
  await execFile("cp", [wavPath, wavAsM4a]);
  await writeFile(emptyPath, Buffer.alloc(0));
  await writeFile(junkPath, Buffer.from("not-an-audio-file-at-all"));
  await writeFile(jpegPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await execFile("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "color=c=black:s=160x120:d=1",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "1", "-c:v", "libx264", "-c:a", "aac", "-shortest", videoPath,
  ]);

  const m4aOk = await assertValidProductSourceFile(m4aPath, "m4a");
  assert.ok(m4aOk.durationSeconds > 0);
  const aacOk = await assertValidProductSourceFile(aacPath, "aac");
  assert.ok(aacOk.durationSeconds > 0);

  await assert.rejects(
    () => assertValidProductSourceFile(wavAsM4a, "m4a"),
    (err: unknown) => err instanceof ProductNormalizeSourceInvalidError,
  );
  await assert.rejects(() => assertValidProductSourceFile(emptyPath, "m4a"));
  await assert.rejects(() => assertValidProductSourceFile(junkPath, "m4a"));
  await assert.rejects(() => assertValidProductSourceFile(jpegPath, "m4a"));


  const aacInMp4AsAac = path.join(fixtureDirectory, "mp4-as.aac");
  await execFile("cp", [m4aPath, aacInMp4AsAac]);
  await assert.rejects(
    () => assertValidProductSourceFile(aacInMp4AsAac, "aac"),
    (err: unknown) =>
      err instanceof ProductNormalizeSourceInvalidError && err.code === "container_mismatch",
    "AAC codec inside MP4 renamed .aac rejected",
  );

  const videoProbe = await probeProductAudioFile(videoPath);
  assert.equal(validateProductSourceProbe("m4a", videoProbe), "has_video");

  await normalizeProductSourceToMp3(m4aPath, outFromM4a);
  const validatedM4a = await validateProductDeliveryMp3File(outFromM4a, m4aOk.durationSeconds);
  assert.ok(validatedM4a.sizeBytes > 0);
  assert.ok(validatedM4a.durationSeconds > 0);

  await normalizeProductSourceToMp3(aacPath, outFromAac);
  const validatedAac = await validateProductDeliveryMp3File(outFromAac, aacOk.durationSeconds);
  assert.ok(validatedAac.sizeBytes > 0);
  assert.ok(Math.abs(validatedAac.durationSeconds - aacOk.durationSeconds) < 0.5);
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log("product-audio-normalize-ffmpeg-unit: ok");
