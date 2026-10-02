import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  MusicTranscodeFfmpegStalledError,
  isValidMusicStreamProbe,
  probeMusicStreamFile,
  runMusicTranscodeChild,
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
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

const repeatedProgress = `
const line = "out_time_us=250000\\nout_time=00:00:00.250000\\nprogress=continue\\n";
process.stdout.write(line);
setInterval(() => process.stdout.write(line), 10);
`;

await assert.rejects(
  () => runMusicTranscodeChild(process.execPath, ["-e", repeatedProgress], {
    progress: { stallMs: 80 },
    termGraceMs: 40,
  }),
  (error: unknown) => {
    assert.ok(error instanceof MusicTranscodeFfmpegStalledError);
    assert.equal(error.code, "ffmpeg_stalled");
    assert.equal(error.details.lastProgressUs, 250_000);
    assert.equal(error.details.lastOutTime, "00:00:00.250000");
    assert.ok(error.details.elapsedMs >= 70);
    return true;
  },
);

const advancingProgress = `
let us = 0;
const step = () => {
  us += 250000;
  process.stdout.write(
    "out_time_us=" + us + "\\n" +
    "out_time=00:00:00.250000\\n" +
    "progress=continue\\n"
  );
  if (us >= 1000000) process.exit(0);
  setTimeout(step, 30);
};
step();
`;
await runMusicTranscodeChild(process.execPath, ["-e", advancingProgress], {
  progress: { stallMs: 70 },
  termGraceMs: 40,
});

console.log("music-transcode-ffmpeg-unit: ok");
