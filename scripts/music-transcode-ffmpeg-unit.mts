import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  MUSIC_STREAM_BITRATE,
  MUSIC_STREAM_BITRATE_MAX,
  MUSIC_STREAM_BITRATE_MIN,
} from "../src/lib/music-transcode/contract";
import {
  isValidMusicStreamProbe,
  probeMusicStreamFile,
  transcodeWavToMp3,
  validateMusicStreamFile,
} from "../src/lib/music-transcode/ffmpeg";

const execFile = promisify(execFileCallback);

const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "audiolad-music-transcode-"));
try {
  const wavPath = path.join(fixtureDirectory, "source.wav");
  const mp3Path = path.join(fixtureDirectory, "out.mp3");
  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "1", "-c:a", "pcm_s16le", wavPath,
  ]);
  await transcodeWavToMp3(wavPath, mp3Path);
  const validated = await validateMusicStreamFile(mp3Path, 1);
  assert.ok(validated.sizeBytes > 0);
  assert.ok(validated.durationSeconds > 0);
  const probe = await probeMusicStreamFile(mp3Path);
  assert.equal(isValidMusicStreamProbe(probe, 1), true);
  assert.ok(probe?.formatNames.includes("mp3"));
  assert.equal(probe?.hasAudioStream, true);
  assert.equal(probe?.hasVideoStream, false);
  assert.ok(probe?.audioCodecNames.includes("mp3"));
  if (probe == null || probe.bitrate == null) {
    throw new Error("ffprobe bitrate missing");
  }
  assert.ok(probe.bitrate >= 240000 && probe.bitrate <= 272000, `bitrate=${probe.bitrate}`);
  if (validated.bitrate == null) {
    throw new Error("validated bitrate missing");
  }
  assert.ok(validated.bitrate >= 240000 && validated.bitrate <= 272000, `validated.bitrate=${validated.bitrate}`);

  const lowRateWavPath = path.join(fixtureDirectory, "low-rate.wav");
  const clampedMp3Path = path.join(fixtureDirectory, "clamped.mp3");
  const resampledMp3Path = path.join(fixtureDirectory, "resampled.mp3");
  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=22050",
    "-t", "1", "-ac", "1", "-c:a", "pcm_s16le", lowRateWavPath,
  ]);
  const sourceProbe = JSON.parse((await execFile("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=sample_rate,channels,codec_name,bits_per_sample",
    "-of", "json",
    lowRateWavPath,
  ])).stdout) as {
    streams?: Array<{
      sample_rate?: string;
      channels?: number;
      codec_name?: string;
      bits_per_sample?: number;
    }>;
  };
  const sourceStream = sourceProbe.streams?.[0];
  assert.equal(sourceStream?.sample_rate, "22050");
  assert.equal(sourceStream?.channels, 1);
  assert.equal(sourceStream?.codec_name, "pcm_s16le");
  assert.equal(sourceStream?.bits_per_sample, 16);

  await execFile("ffmpeg", [
    "-y", "-i", lowRateWavPath,
    "-map", "0:a:0",
    "-vn",
    "-c:a", "libmp3lame",
    "-b:a", MUSIC_STREAM_BITRATE,
    clampedMp3Path,
  ]);
  const clamped = await probeMusicStreamFile(clampedMp3Path);
  assert.equal(clamped?.bitrate != null && clamped.bitrate < MUSIC_STREAM_BITRATE_MIN, true);
  assert.equal(isValidMusicStreamProbe(clamped, 1), false);
  await assert.rejects(() => validateMusicStreamFile(clampedMp3Path, 1));

  await transcodeWavToMp3(lowRateWavPath, resampledMp3Path);
  const resampled = await validateMusicStreamFile(resampledMp3Path, 1);
  assert.equal(isValidMusicStreamProbe(await probeMusicStreamFile(resampledMp3Path), 1), true);
  if (resampled.bitrate == null) {
    throw new Error("resampled bitrate missing");
  }
  assert.ok(
    resampled.bitrate >= MUSIC_STREAM_BITRATE_MIN && resampled.bitrate <= MUSIC_STREAM_BITRATE_MAX,
    `resampled.bitrate=${resampled.bitrate}`,
  );
  const resampledProbe = JSON.parse((await execFile("ffprobe", [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate",
    "-of", "json",
    resampledMp3Path,
  ])).stdout) as { streams?: Array<{ sample_rate?: string }> };
  assert.equal(resampledProbe.streams?.[0]?.sample_rate, "44100");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log("music-transcode-ffmpeg-unit: ok");
