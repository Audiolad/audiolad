import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MAX_STUDIO_AUDIO_DURATION_SECONDS,
  MAX_STUDIO_PROJECT_TIMELINE_SECONDS,
  MAX_STUDIO_TRACKS,
} from "../src/lib/studio/limits";
import {
  assertStudioProjectTimelineLimit,
  getStudioProjectTimelineEndSeconds,
} from "../src/lib/studio/clip-geometry-limits";
import {
  buildStudioRenderFilterGraph,
  studioRenderFfmpegOutputArgs,
} from "../src/lib/studio/render/ffmpeg";
import { renderStudioProjectToMp3 } from "../src/lib/studio/render/render";
import {
  assertStudioRenderTimelineSafe,
  StudioRenderTimelineGuardError,
} from "../src/lib/studio/render/timeline-guard";
import { buildStudioRenderTimeline } from "../src/lib/studio/render/timeline";
import type { StudioRenderSnapshot } from "../src/lib/studio/render/types";

function snapshot(clips: Array<{
  startTime: number;
  offset?: number;
  duration: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}>, assetDuration = 3): StudioRenderSnapshot {
  return {
    project: { id: "p", revision: 1, name: "t", schemaVersion: 2, studioVersion: 1 },
    tracks: [{
      id: "t1",
      slotId: null,
      trackKind: "music",
      volume: 1,
      muted: false,
      voicePreset: "none",
      assetId: "a1",
      clips: clips.map((clip, index) => ({
        id: `c${index}`,
        assetId: "a1",
        startTime: clip.startTime,
        offset: clip.offset ?? 0,
        duration: clip.duration,
        fadeInDuration: clip.fadeInDuration ?? 0,
        fadeOutDuration: clip.fadeOutDuration ?? 0,
      })),
    }],
    assets: [{
      id: "a1",
      sourceType: "upload",
      storagePath: "x",
      mimeType: "audio/wav",
      durationSeconds: assetDuration,
    }],
  };
}

function createConstantWav(durationSeconds: number, amplitude = 0.2): Buffer {
  const rate = 44_100;
  const frames = Math.round(durationSeconds * rate);
  const data = Buffer.alloc(frames * 8);
  for (let i = 0; i < frames; i += 1) {
    data.writeFloatLE(amplitude, i * 8);
    data.writeFloatLE(amplitude, i * 8 + 4);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); // IEEE float
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 8, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function commandAvailable(name: string): boolean {
  return spawnSync(name, ["-version"], { encoding: "utf8" }).status === 0;
}

async function main() {
  assert.equal(MAX_STUDIO_TRACKS, 5);
  assert.equal(MAX_STUDIO_PROJECT_TIMELINE_SECONDS, 10_800);
  assert.equal(MAX_STUDIO_PROJECT_TIMELINE_SECONDS, MAX_STUDIO_AUDIO_DURATION_SECONDS);

  // Normal project
  const normal = snapshot([{ startTime: 0, duration: 2 }]);
  assert.equal(assertStudioRenderTimelineSafe(normal), 2);
  assert.equal(buildStudioRenderTimeline(normal).durationSeconds, 2);
  const normalGraph = buildStudioRenderFilterGraph({
    snapshot: normal,
    localAssetPaths: new Map([["a1", "/tmp/x.wav"]]),
  });
  assert.equal(normalGraph.durationSeconds, 2);
  const outArgs = studioRenderFfmpegOutputArgs("/tmp/out.mp3", normalGraph.durationSeconds);
  assert.ok(outArgs.includes("-t"));
  assert.ok(outArgs.includes("2.000000"));
  assert.ok(outArgs.includes("192k"));

  // Boundary: exactly 10800s end is allowed
  const atExact = snapshot(
    [{ startTime: 0, duration: MAX_STUDIO_PROJECT_TIMELINE_SECONDS }],
    MAX_STUDIO_PROJECT_TIMELINE_SECONDS,
  );
  assert.equal(getStudioProjectTimelineEndSeconds(atExact.tracks), MAX_STUDIO_PROJECT_TIMELINE_SECONDS);
  assert.equal(assertStudioProjectTimelineLimit(atExact.tracks), MAX_STUDIO_PROJECT_TIMELINE_SECONDS);
  assert.equal(assertStudioRenderTimelineSafe(atExact), MAX_STUDIO_PROJECT_TIMELINE_SECONDS);

  const atExactOffset = snapshot(
    [{ startTime: 10_799, duration: 1 }],
    MAX_STUDIO_PROJECT_TIMELINE_SECONDS,
  );
  assert.equal(getStudioProjectTimelineEndSeconds(atExactOffset.tracks), 10_800);
  assert.equal(assertStudioRenderTimelineSafe(atExactOffset), 10_800);

  // 10800 + ε rejected via shared project timeline limit (not startTime-only)
  const overByEpsilon = snapshot(
    [{ startTime: 0, duration: MAX_STUDIO_PROJECT_TIMELINE_SECONDS + 0.001 }],
    MAX_STUDIO_PROJECT_TIMELINE_SECONDS,
  );
  assert.throws(
    () => assertStudioProjectTimelineLimit(overByEpsilon.tracks),
    (error: unknown) =>
      error instanceof Error && error.name === "StudioProjectTimelineLimitError",
  );
  assert.throws(
    () => assertStudioRenderTimelineSafe(overByEpsilon),
    (error: unknown) =>
      error instanceof Error
      && error.name === "StudioRenderTimelineGuardError"
      && (error as StudioRenderTimelineGuardError).code === "studio_render_timeline_too_long",
  );

  // startTime=10799, duration=2 → end 10801 > 3h
  const overNearEnd = snapshot(
    [{ startTime: 10_799, duration: 2 }],
    MAX_STUDIO_PROJECT_TIMELINE_SECONDS,
  );
  assert.equal(getStudioProjectTimelineEndSeconds(overNearEnd.tracks), 10_801);
  assert.throws(
    () => assertStudioRenderTimelineSafe(overNearEnd),
    (error: unknown) =>
      error instanceof Error
      && error.name === "StudioRenderTimelineGuardError"
      && (error as StudioRenderTimelineGuardError).code === "studio_render_timeline_too_long",
  );

  // NaN / Infinity / negative
  for (const bad of [
    snapshot([{ startTime: Number.NaN, duration: 1 }]),
    snapshot([{ startTime: 0, duration: Number.POSITIVE_INFINITY }]),
    snapshot([{ startTime: -1, duration: 1 }]),
    snapshot([{ startTime: 0, duration: -2 }]),
  ]) {
    assert.throws(
      () => assertStudioRenderTimelineSafe(bad),
      (error: unknown) =>
        error instanceof Error
        && error.name === "StudioRenderTimelineGuardError"
        && (error as StudioRenderTimelineGuardError).code === "studio_render_timeline_invalid",
    );
  }

  // Pathological startTime that previously produced ~14GB at 192kbps
  const pathologicalStart = snapshot([{ startTime: 625_000, duration: 3 }]);
  const pathologicalTimeline = buildStudioRenderTimeline(pathologicalStart).durationSeconds;
  assert.equal(pathologicalTimeline, 625_003);
  const expectedBytes = Math.ceil(pathologicalTimeline * 192_000 / 8);
  assert.ok(expectedBytes > 13 * 1024 * 1024 * 1024);
  assert.throws(
    () => assertStudioRenderTimelineSafe(pathologicalStart),
    (error: unknown) =>
      error instanceof Error
      && error.name === "StudioRenderTimelineGuardError"
      && (error as StudioRenderTimelineGuardError).code === "studio_render_timeline_too_long",
  );
  assert.throws(
    () => buildStudioRenderFilterGraph({
      snapshot: pathologicalStart,
      localAssetPaths: new Map([["a1", "/tmp/x.wav"]]),
    }),
    (error: unknown) => error instanceof Error && error.name === "StudioRenderTimelineGuardError",
  );

  // Pathological duration → project end >> 3h (shared timeline limit)
  const pathologicalDuration = snapshot([{ startTime: 0, duration: 625_000 }], 3);
  assert.throws(
    () => assertStudioRenderTimelineSafe(pathologicalDuration),
    (error: unknown) =>
      error instanceof Error
      && error.name === "StudioRenderTimelineGuardError"
      && (error as StudioRenderTimelineGuardError).code === "studio_render_timeline_too_long",
  );

  // Two sequential max clips would make 6h — rejected by project timeline max
  const twoMaxClips = snapshot(
    [
      { startTime: 0, duration: MAX_STUDIO_PROJECT_TIMELINE_SECONDS },
      { startTime: MAX_STUDIO_PROJECT_TIMELINE_SECONDS, duration: 1 },
    ],
    MAX_STUDIO_PROJECT_TIMELINE_SECONDS,
  );
  assert.throws(
    () => assertStudioRenderTimelineSafe(twoMaxClips),
    (error: unknown) =>
      error instanceof Error
      && error.name === "StudioRenderTimelineGuardError"
      && (error as StudioRenderTimelineGuardError).code === "studio_render_timeline_too_long",
  );

  // Production MP3 output args always include -t; missing/invalid duration throws
  assert.deepEqual(
    studioRenderFfmpegOutputArgs("/tmp/a.mp3", 1.5).filter((part, index, all) =>
      part === "-t" || all[index - 1] === "-t"
    ),
    ["-t", "1.500000"],
  );
  assert.throws(() => studioRenderFfmpegOutputArgs("/tmp/a.mp3", 0));
  assert.throws(() => studioRenderFfmpegOutputArgs("/tmp/a.mp3", Number.NaN));
  assert.throws(() =>
    (studioRenderFfmpegOutputArgs as (path: string, durationSeconds?: number) => string[])(
      "/tmp/a.mp3",
    ),
  );

  if (commandAvailable("ffmpeg") && commandAvailable("ffprobe")) {
    const root = await mkdtemp(join(tmpdir(), "audiolad-duration-ff-"));
    try {
      const wavPath = join(root, "src.wav");
      await writeFile(wavPath, createConstantWav(1));
      const okSnap = snapshot([{ startTime: 0, duration: 1 }], 1);
      const result = await renderStudioProjectToMp3(
        { snapshot: okSnap, localAssetPaths: new Map([["a1", wavPath]]) },
        { renderId: "ok", outputDirectory: root },
      );
      const probe = spawnSync("ffprobe", [
        "-v", "error",
        "-show_entries", "stream=codec_name,bit_rate:format=duration,size",
        "-of", "json",
        result.outputPath,
      ], { encoding: "utf8" });
      assert.equal(probe.status, 0);
      const meta = JSON.parse(probe.stdout);
      assert.equal(meta.streams[0].codec_name, "mp3");
      assert.ok(Number(meta.format.duration) >= 0.9 && Number(meta.format.duration) <= 1.2);
      assert.ok(Number(meta.streams[0].bit_rate) >= 180_000 && Number(meta.streams[0].bit_rate) <= 200_000);
      // Pathological must fail before producing a giant file
      await assert.rejects(
        () => renderStudioProjectToMp3(
          {
            snapshot: pathologicalStart,
            localAssetPaths: new Map([["a1", wavPath]]),
          },
          { renderId: "bad", outputDirectory: root },
        ),
        (error: unknown) => error instanceof Error && error.name === "StudioRenderTimelineGuardError",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  } else {
    console.log("studio-render-timeline-guard-unit: ffmpeg not available, skipped integration");
  }

  console.log("studio-render-timeline-guard-unit: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
