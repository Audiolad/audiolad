import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

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
  if (probe?.bitrate != null) {
    assert.ok(probe.bitrate >= 240000 && probe.bitrate <= 272000, `bitrate=${probe.bitrate}`);
  }
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log("music-transcode-ffmpeg-unit: ok");
