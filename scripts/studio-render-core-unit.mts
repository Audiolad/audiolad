import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { createStudioVoicePresetImpulseWav } from "../src/lib/studio/render/ir";
import { buildStudioRenderTimeline } from "../src/lib/studio/render/timeline";
import {
  renderStudioProjectToMp3,
  renderStudioProjectToPcmWav,
  withStudioRenderWorkspace,
} from "../src/lib/studio/render/render";
import { createStudioRenderSnapshot } from "../src/lib/studio/render/snapshot";
import { validateStudioProjectDocument } from "../src/lib/studio/persistence";
import { STUDIO_VOICE_PRESET_CONFIG } from "../src/lib/studio/voice-preset-dsp";

const ASSET_VOICE = "11111111-1111-4111-8111-111111111111";
const ASSET_MUSIC = "22222222-2222-4222-8222-222222222222";
const ASSET_UNUSED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TIMESTAMP_WARNING = /Queue input is backward in time|Non-monotonous DTS|Non-monotonic DTS|timestamp discontinuity/i;
const RATE = 44_100;

function asset(id: string, storagePath: string, duration = 3) {
  return {
    id, project_id: "project", storage_path: storagePath, original_name: `${id}.wav`,
    mime_type: "audio/wav", size_bytes: 1, duration_seconds: duration,
    source_type: "upload" as const, created_at: "2026-01-01T00:00:00Z", deleted_at: null,
  };
}

function assertNoTimestampWarnings(stderr: string): void {
  assert.doesNotMatch(stderr, TIMESTAMP_WARNING, `FFmpeg emitted a timestamp warning:\n${stderr}`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertDeepFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  assert(Object.isFrozen(value), "snapshot descendants must be frozen");
  for (const child of Object.values(value as Record<string, unknown>)) assertDeepFrozen(child);
}

function assertMissing(path: string): Promise<void> {
  return assert.rejects(access(path));
}

function makeFloatWav(samples: Float32Array): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(samples.byteLength + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2 * 4, 28);
  header.writeUInt16LE(2 * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

function createConstantWav(durationSeconds: number, amplitude: number): Buffer {
  return makeFloatWav(new Float32Array(Math.round(durationSeconds * RATE) * 2).fill(amplitude));
}

function createRampWav(durationSeconds: number): Buffer {
  const samples = new Float32Array(Math.round(durationSeconds * RATE) * 2);
  for (let frame = 0; frame < samples.length / 2; frame += 1) {
    const value = frame / RATE;
    samples[frame * 2] = value;
    samples[frame * 2 + 1] = value;
  }
  return makeFloatWav(samples);
}

function project(
  preset: "none" | "focus" | "depth" | "trance" = "focus",
  voiceVolume = 2,
  musicMuted = false,
) {
  return {
    id: "project", author_id: "author", guest_session_id: null, name: "Synthetic render", schema_version: 2,
    revision: 7, status: "active" as const, created_at: "", updated_at: "", last_opened_at: null, deleted_at: null,
    project_data: {
      schemaVersion: 2 as const, studioVersion: 1 as const, editor: { currentTime: 0 },
      slots: [
        { id: "voice", name: "Voice", audioTrackId: "voice-track", trackKind: "voice" as const },
        { id: "music", name: "Music", audioTrackId: "music-track", trackKind: "music" as const },
      ],
      tracks: [
        {
          id: "voice-track", assetId: ASSET_VOICE, name: "Voice", volume: voiceVolume, muted: false,
          trackKind: "voice" as const, voicePreset: preset,
          clips: [
            { id: "voice-a", startTime: 0.2, offset: 0.25, duration: 0.5, fadeInDuration: 0.1, fadeOutDuration: 0.1 },
            { id: "voice-b", startTime: 1.5, offset: 1, duration: 0.5, fadeInDuration: 0, fadeOutDuration: 0.2 },
          ],
        },
        {
          id: "music-track", assetId: ASSET_MUSIC, name: "Music", volume: 0.25, muted: musicMuted,
          trackKind: "music" as const, voicePreset: "none" as const,
          clips: [{ id: "music-a", startTime: 0, offset: 0, duration: 2, fadeInDuration: 0.25, fadeOutDuration: 0.25 }],
        },
      ],
    },
  };
}

function pcmSamples(wav: Buffer): Float32Array {
  const dataOffset = wav.indexOf("data") + 8;
  assert(dataOffset >= 8, "WAV data chunk is required");
  const dataLength = wav.readUInt32LE(dataOffset - 4);
  const bytes = Uint8Array.from(wav.subarray(dataOffset, dataOffset + dataLength));
  return new Float32Array(bytes.buffer);
}

function peak(samples: Float32Array, start = 0, end = samples.length): number {
  let value = 0;
  for (let index = start; index < end; index += 1) value = Math.max(value, Math.abs(samples[index]));
  return value;
}

function framePeak(samples: Float32Array, frame: number): number {
  return Math.max(Math.abs(samples[frame * 2]), Math.abs(samples[frame * 2 + 1]));
}

function sampleRangePeak(samples: Float32Array, startFrame: number, endFrame: number): number {
  return peak(samples, startFrame * 2, endFrame * 2);
}

async function decodeMp3ToPcmSamples(root: string, inputPath: string): Promise<Float32Array> {
  const outputPath = join(root, "decoded-clipping-observation.wav");
  const decoded = spawnSync("ffmpeg", [
    "-hide_banner", "-nostdin", "-y", "-i", inputPath,
    "-c:a", "pcm_f32le", "-ar", String(RATE), "-ac", "2", outputPath,
  ], { encoding: "utf8" });
  assert.equal(decoded.status, 0, decoded.stderr);
  assertNoTimestampWarnings(decoded.stderr);
  return pcmSamples(await readFile(outputPath));
}

async function renderFixturePcm(
  root: string,
  name: string,
  snapshot: ReturnType<typeof createStudioRenderSnapshot>,
  localAssetPaths: ReadonlyMap<string, string>,
) {
  const result = await renderStudioProjectToPcmWav(
    { snapshot, localAssetPaths },
    { renderId: `fixture-${name}`, outputDirectory: root },
  );
  assertNoTimestampWarnings(result.stderr);
  return { result, samples: pcmSamples(await readFile(result.outputPath)) };
}

async function renderFixtureMp3(
  root: string,
  name: string,
  snapshot: ReturnType<typeof createStudioRenderSnapshot>,
  localAssetPaths: ReadonlyMap<string, string>,
) {
  const result = await renderStudioProjectToMp3(
    { snapshot, localAssetPaths },
    { renderId: `fixture-${name}`, outputDirectory: root },
  );
  assertNoTimestampWarnings(result.stderr);
  return result;
}

function fixtureProject(clips: Array<{
  id: string;
  startTime: number;
  offset: number;
  duration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
}>) {
  const value = project("none", 1, true);
  value.project_data.tracks[0].clips = clips;
  return value;
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "audiolad-render-test-"));
  try {
    const voicePath = join(root, "voice.wav");
    const musicPath = join(root, "music.wav");
    const constantPath = join(root, "constant.wav");
    const rampPath = join(root, "ramp.wav");
    // Deterministic stereo float WAVs: 440 Hz voice and 110 Hz music.
    const makeTone = (frequency: number) => {
      const samples = new Float32Array(3 * RATE * 2);
      for (let i = 0; i < samples.length / 2; i += 1) {
        const value = Math.sin((2 * Math.PI * frequency * i) / RATE) * 0.25;
        samples[i * 2] = value;
        samples[i * 2 + 1] = value;
      }
      const wav = createStudioVoicePresetImpulseWav("focus");
      const header = Buffer.from(wav.subarray(0, 44));
      header.writeUInt32LE(samples.byteLength + 36, 4);
      header.writeUInt32LE(samples.byteLength, 40);
      return Buffer.concat([header, Buffer.from(samples.buffer)]);
    };
    await writeFile(voicePath, makeTone(440));
    await writeFile(musicPath, makeTone(110));
    await writeFile(constantPath, createConstantWav(3, 0.25));
    await writeFile(rampPath, createRampWav(3));

    const sourceProject = project();
    const sourceAssets = [
      asset(ASSET_VOICE, "voice.wav"),
      asset(ASSET_MUSIC, "music.wav"),
      asset(ASSET_UNUSED, "unrelated.wav"),
    ];
    const snapshot = createStudioRenderSnapshot({
      project: sourceProject, expectedRevision: 7,
      assets: sourceAssets,
    });
    assert(Object.isFrozen(snapshot));
    assertDeepFrozen(snapshot);
    assert.equal(snapshot.tracks[0].clips[0].offset, 0.25);
    assert.throws(() => {
      (snapshot.tracks[0].clips[0] as { offset: number }).offset = 99;
    }, TypeError);
    assert.equal(snapshot.tracks[0].clips[0].offset, 0.25, "frozen snapshot must reject nested mutation");
    sourceProject.project_data.tracks[0].clips[0].offset = 2;
    sourceProject.project_data.tracks[0].name = "mutated source";
    sourceAssets[0].storage_path = "mutated-source.wav";
    assert.equal(snapshot.tracks[0].clips[0].offset, 0.25, "snapshot must not retain source clip references");
    assert.equal(snapshot.assets[0].storagePath, "voice.wav", "snapshot must not retain source asset references");
    assert.equal(snapshot.assets.length, 2, "snapshot must not retain unreferenced project assets");
    assert.equal(buildStudioRenderTimeline(snapshot).durationSeconds, 2.25);
    assert.throws(() => createStudioRenderSnapshot({
      project: project(), expectedRevision: 6, assets: [asset(ASSET_VOICE, "voice.wav")],
    }), /revision/);

    const input = { snapshot, localAssetPaths: new Map([[ASSET_VOICE, voicePath], [ASSET_MUSIC, musicPath]]) };
    const focusPcm = await renderStudioProjectToPcmWav(input, { renderId: "focus-pcm", outputDirectory: root });
    assertNoTimestampWarnings(focusPcm.stderr);
    const focusPcmRepeat = await renderStudioProjectToPcmWav(input, { renderId: "focus-pcm-repeat", outputDirectory: root });
    assertNoTimestampWarnings(focusPcmRepeat.stderr);
    const focusPcmBytes = await readFile(focusPcm.outputPath);
    assert.deepEqual(focusPcmBytes, await readFile(focusPcmRepeat.outputPath), "final PCM must be deterministic");
    const focusSamples = pcmSamples(focusPcmBytes);
    assert.equal(focusSamples.length / 2, Math.round(2.25 * 44_100));
    assert(
      peak(focusSamples, 2 * 44_100 * 2) > 1e-12,
      `voice tail must contain wet energy; observed ${peak(focusSamples, 2 * 44_100 * 2)}`,
    );
    const first = await renderStudioProjectToMp3(input, { renderId: "first", outputDirectory: root });
    assertNoTimestampWarnings(first.stderr);
    const second = await renderStudioProjectToMp3(input, { renderId: "second", outputDirectory: root });
    assertNoTimestampWarnings(second.stderr);
    const firstBytes = await readFile(first.outputPath);
    assert.deepEqual(firstBytes, await readFile(second.outputPath), "same render must be byte-stable");
    assert(first.sizeBytes > 1_000);
    assert.equal(createHash("sha256").update(firstBytes).digest("hex").length, 64);

    const probe = spawnSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate:format=duration,size",
      "-of", "json", first.outputPath,
    ], { encoding: "utf8" });
    assert.equal(probe.status, 0, probe.stderr);
    const metadata = JSON.parse(probe.stdout);
    assert.equal(metadata.streams[0].codec_name, "mp3");
    assert.equal(metadata.streams[0].sample_rate, "44100");
    assert.equal(metadata.streams[0].channels, 2);
    assert(
      Number(metadata.format.duration) >= 2.2 && Number(metadata.format.duration) <= 2.45,
      JSON.stringify(metadata),
    );

    const noneSnapshot = createStudioRenderSnapshot({
      project: project("none"), expectedRevision: 7,
      assets: [asset(ASSET_VOICE, "voice.wav"), asset(ASSET_MUSIC, "music.wav")],
    });
    const dry = await renderStudioProjectToMp3(
      { snapshot: noneSnapshot, localAssetPaths: input.localAssetPaths },
      { renderId: "dry", outputDirectory: root },
    );
    assertNoTimestampWarnings(dry.stderr);
    assert.equal(dry.durationSeconds, 2);
    const dryPcm = await renderStudioProjectToPcmWav(
      { snapshot: noneSnapshot, localAssetPaths: input.localAssetPaths },
      { renderId: "dry-pcm", outputDirectory: root },
    );
    assertNoTimestampWarnings(dryPcm.stderr);
    assert.equal(pcmSamples(await readFile(dryPcm.outputPath)).length / 2, 2 * 44_100);
    assert.notDeepEqual(await readFile(first.outputPath), await readFile(dry.outputPath), "preset must affect PCM/MP3");
    for (const [preset, expectedDuration] of [["depth", 2.25], ["trance", 2.3]] as const) {
      const presetSnapshot = createStudioRenderSnapshot({
        project: project(preset), expectedRevision: 7,
        assets: [asset(ASSET_VOICE, "voice.wav"), asset(ASSET_MUSIC, "music.wav")],
      });
      const rendered = await renderStudioProjectToMp3(
        { snapshot: presetSnapshot, localAssetPaths: input.localAssetPaths },
        { renderId: preset, outputDirectory: root },
      );
      assertNoTimestampWarnings(rendered.stderr);
      assert.equal(rendered.durationSeconds, expectedDuration);
      assert.notDeepEqual(await readFile(first.outputPath), await readFile(rendered.outputPath));
      const presetPcm = await renderStudioProjectToPcmWav(
        { snapshot: presetSnapshot, localAssetPaths: input.localAssetPaths },
        { renderId: `${preset}-pcm`, outputDirectory: root },
      );
      assertNoTimestampWarnings(presetPcm.stderr);
      const dryEndOffset = 2 * 44_100 * 2;
      assert(peak(pcmSamples(await readFile(presetPcm.outputPath)), dryEndOffset) > 1e-12);
    }
    const mutedGainSnapshot = createStudioRenderSnapshot({
      project: project("none", 0, true), expectedRevision: 7,
      assets: [asset(ASSET_VOICE, "voice.wav"), asset(ASSET_MUSIC, "music.wav")],
    });
    assert.equal(buildStudioRenderTimeline(mutedGainSnapshot).durationSeconds, 0, "gain 0 is non-audible");
    const explicitlyMutedProject = project("none", 1, false);
    explicitlyMutedProject.project_data.tracks[0].muted = true;
    explicitlyMutedProject.project_data.tracks[1].muted = true;
    const explicitlyMutedSnapshot = createStudioRenderSnapshot({
      project: explicitlyMutedProject, expectedRevision: 7,
      assets: [asset(ASSET_VOICE, "voice.wav"), asset(ASSET_MUSIC, "music.wav")],
    });
    assert.equal(buildStudioRenderTimeline(explicitlyMutedSnapshot).durationSeconds, 0, "muted tracks are non-audible");
    await assert.rejects(
      renderStudioProjectToPcmWav(
        { snapshot: explicitlyMutedSnapshot, localAssetPaths: input.localAssetPaths },
        { renderId: "all-muted", outputDirectory: root },
      ),
      /no audible clips/,
    );
    const gainPeaks = await Promise.all([1, 2, 4].map(async (volume) => {
      const gainSnapshot = createStudioRenderSnapshot({
        project: project("none", volume, true), expectedRevision: 7,
        assets: [asset(ASSET_VOICE, "voice.wav"), asset(ASSET_MUSIC, "music.wav")],
      });
      const result = await renderStudioProjectToPcmWav(
        { snapshot: gainSnapshot, localAssetPaths: input.localAssetPaths },
        { renderId: `gain-${volume}`, outputDirectory: root },
      );
      assertNoTimestampWarnings(result.stderr);
      return peak(pcmSamples(await readFile(result.outputPath)));
    }));
    assert(Math.abs(gainPeaks[1] / gainPeaks[0] - 2) < 0.001);
    assert(Math.abs(gainPeaks[2] / gainPeaks[0] - 4) < 0.001);

    // PCM-only clip fixtures make all timing and envelope measurements exact,
    // independent of MP3 encoder delay and the preset convolution path.
    const fixtureAssets = [asset(ASSET_VOICE, "constant.wav"), asset(ASSET_MUSIC, "music.wav")];
    const fixturePaths = new Map([[ASSET_VOICE, constantPath], [ASSET_MUSIC, musicPath]]);
    const clipCases = [
      {
        name: "zero",
        clips: [{ id: "zero", startTime: 0, offset: 0, duration: 0.25, fadeInDuration: 0, fadeOutDuration: 0 }],
        duration: 0.25,
        verify: (samples: Float32Array) => assert(Math.abs(framePeak(samples, 100) - 0.25) < 1e-6),
      },
      {
        name: "delayed",
        clips: [{ id: "delayed", startTime: 0.5, offset: 0, duration: 0.25, fadeInDuration: 0, fadeOutDuration: 0 }],
        duration: 0.75,
        verify: (samples: Float32Array) => {
          assert.equal(sampleRangePeak(samples, 0, Math.round(0.5 * RATE)), 0);
          assert(Math.abs(framePeak(samples, Math.round(0.5 * RATE) + 100) - 0.25) < 1e-6);
        },
      },
      {
        name: "two",
        clips: [
          { id: "two-a", startTime: 0, offset: 0, duration: 0.25, fadeInDuration: 0, fadeOutDuration: 0 },
          { id: "two-b", startTime: 0.5, offset: 0, duration: 0.25, fadeInDuration: 0, fadeOutDuration: 0 },
        ],
        duration: 0.75,
        verify: (samples: Float32Array) => {
          assert.equal(sampleRangePeak(samples, Math.round(0.25 * RATE), Math.round(0.5 * RATE)), 0);
          assert(Math.abs(framePeak(samples, Math.round(0.5 * RATE) + 100) - 0.25) < 1e-6);
        },
      },
      {
        name: "three",
        clips: [
          { id: "three-a", startTime: 0, offset: 0, duration: 0.2, fadeInDuration: 0, fadeOutDuration: 0 },
          { id: "three-b", startTime: 0.3, offset: 0, duration: 0.2, fadeInDuration: 0, fadeOutDuration: 0 },
          { id: "three-c", startTime: 0.6, offset: 0, duration: 0.2, fadeInDuration: 0, fadeOutDuration: 0 },
        ],
        duration: 0.8,
        verify: (samples: Float32Array) => {
          assert.equal(sampleRangePeak(samples, Math.round(0.2 * RATE), Math.round(0.3 * RATE)), 0);
          assert.equal(sampleRangePeak(samples, Math.round(0.5 * RATE), Math.round(0.6 * RATE)), 0);
          assert(Math.abs(framePeak(samples, Math.round(0.6 * RATE) + 100) - 0.25) < 1e-6);
        },
      },
    ] as const;
    for (const testCase of clipCases) {
      const fixtureSnapshot = createStudioRenderSnapshot({
        project: fixtureProject([...testCase.clips]), expectedRevision: 7, assets: fixtureAssets,
      });
      const rendered = await renderFixturePcm(root, testCase.name, fixtureSnapshot, fixturePaths);
      assert.equal(rendered.result.durationSeconds, testCase.duration, `${testCase.name} duration`);
      assert.equal(rendered.samples.length / 2, Math.round(testCase.duration * RATE));
      testCase.verify(rendered.samples);
    }
    const trimSnapshot = createStudioRenderSnapshot({
      project: fixtureProject([
        { id: "trim", startTime: 0, offset: 0.5, duration: 0.25, fadeInDuration: 0, fadeOutDuration: 0 },
      ]),
      expectedRevision: 7,
      assets: fixtureAssets,
    });
    const trimmed = await renderFixturePcm(
      root,
      "trim",
      trimSnapshot,
      new Map([[ASSET_VOICE, rampPath], [ASSET_MUSIC, musicPath]]),
    );
    assert(Math.abs(framePeak(trimmed.samples, 10) - (0.5 + 10 / RATE)) < 1e-5, "offset must trim source PCM");

    const fadeCases = [
      {
        name: "fade-in",
        fadeInDuration: 0.25,
        fadeOutDuration: 0,
        measurements: [[0.125, 0.125], [0.25, 0.25]] as const,
      },
      {
        name: "fade-out",
        fadeInDuration: 0,
        fadeOutDuration: 0.25,
        measurements: [[0.75, 0.25], [0.875, 0.125]] as const,
      },
      {
        name: "fade-both",
        fadeInDuration: 0.25,
        fadeOutDuration: 0.25,
        measurements: [[0.125, 0.125], [0.25, 0.25], [0.75, 0.25], [0.875, 0.125]] as const,
      },
    ] as const;
    for (const fadeCase of fadeCases) {
      const fadeSnapshot = createStudioRenderSnapshot({
        project: fixtureProject([{
          id: fadeCase.name,
          startTime: 0,
          offset: 0,
          duration: 1,
          fadeInDuration: fadeCase.fadeInDuration,
          fadeOutDuration: fadeCase.fadeOutDuration,
        }]),
        expectedRevision: 7,
        assets: fixtureAssets,
      });
      const faded = await renderFixturePcm(root, fadeCase.name, fadeSnapshot, fixturePaths);
      for (const [seconds, expected] of fadeCase.measurements) {
        assert(
          Math.abs(framePeak(faded.samples, Math.round(seconds * RATE)) - expected) < 2e-5,
          `${fadeCase.name} linear measurement at ${seconds}s`,
        );
      }
    }

    const fiveAssetIds = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
    ];
    const fiveTracksProject = project("none", 1, true);
    fiveTracksProject.project_data.tracks = fiveAssetIds.map((id, index) => ({
      id: `five-track-${index}`,
      assetId: id,
      name: `Five ${index}`,
      volume: [1.5, 1.25, 4, 1.5, 1.25][index],
      muted: index === 2,
      trackKind: index < 3 ? "voice" as const : "music" as const,
      voicePreset: (["focus", "depth", "trance", "none", "none"] as const)[index],
      clips: index === 3
        ? [
          { id: "music-gap-a", startTime: 0, offset: 0.2, duration: 0.35, fadeInDuration: 0.1, fadeOutDuration: 0.05 },
          { id: "music-gap-b", startTime: 0.55, offset: 0.5, duration: 0.3, fadeInDuration: 0.05, fadeOutDuration: 0.1 },
        ]
        : [{
          id: `five-clip-${index}`,
          startTime: index === 1 ? 0.15 : index === 4 ? 0.1 : 0,
          offset: index === 0 ? 0.2 : 0.1,
          duration: index === 4 ? 0.8 : index === 2 ? 0.9 : index === 1 ? 0.55 : 0.65,
          fadeInDuration: index === 0 ? 0.1 : 0.05,
          fadeOutDuration: index === 1 ? 0.1 : 0.05,
        }],
    })) as unknown as typeof fiveTracksProject.project_data.tracks;
    fiveTracksProject.project_data.slots = fiveTracksProject.project_data.tracks.map((track, index) => ({
      id: `five-slot-${index}`, name: track.name, audioTrackId: track.id, trackKind: track.trackKind,
    }));
    const fivePaths = new Map<string, string>();
    const fiveAssets = fiveAssetIds.map((id, index) => {
      const path = join(root, `five-${index}.wav`);
      fivePaths.set(id, path);
      return asset(id, `five-${index}.wav`);
    });
    await Promise.all([...fivePaths.values()].map((path, index) => writeFile(path, makeTone(180 + index * 90))));
    const fiveSnapshot = createStudioRenderSnapshot({
      project: fiveTracksProject, expectedRevision: 7, assets: fiveAssets,
    });
    const fiveRendered = await renderFixturePcm(root, "five-track-product-complete", fiveSnapshot, fivePaths);
    assert.equal(fiveSnapshot.tracks.filter((track) => track.trackKind === "voice").length, 3);
    assert.equal(fiveSnapshot.tracks.filter((track) => track.trackKind === "music").length, 2);
    assert(Math.abs(buildStudioRenderTimeline(fiveSnapshot).durationSeconds - 0.95) < 1e-9);
    assert(Math.abs(fiveRendered.result.durationSeconds - 0.95) < 1e-9);
    assert.equal(fiveSnapshot.tracks.find((track) => track.id === "five-track-2")?.muted, true);
    assert.equal(fiveSnapshot.tracks.find((track) => track.id === "five-track-0")?.voicePreset, "focus");
    assert.equal(fiveSnapshot.tracks.find((track) => track.id === "five-track-1")?.voicePreset, "depth");
    assert.equal(sampleRangePeak(fiveRendered.samples, Math.round(0.35 * RATE), Math.round(0.5 * RATE)) > 0, true);
    const fiveMp3 = await renderFixtureMp3(root, "five-track-product-complete", fiveSnapshot, fivePaths);
    assert(fiveMp3.sizeBytes > 1_000);
    const productProbe = spawnSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels:format=duration", "-of", "json", fiveMp3.outputPath,
    ], { encoding: "utf8" });
    assert.equal(productProbe.status, 0, productProbe.stderr);
    const productMetadata = JSON.parse(productProbe.stdout);
    assert.equal(productMetadata.streams[0].codec_name, "mp3");
    assert.equal(productMetadata.streams[0].channels, 2);

    const fourTracksProject = clone(fiveTracksProject);
    fourTracksProject.project_data.tracks = [
      fourTracksProject.project_data.tracks[0],
      fourTracksProject.project_data.tracks[1],
      fourTracksProject.project_data.tracks[3],
      fourTracksProject.project_data.tracks[4],
    ];
    fourTracksProject.project_data.slots = [
      fourTracksProject.project_data.slots[0],
      fourTracksProject.project_data.slots[1],
      fourTracksProject.project_data.slots[3],
      fourTracksProject.project_data.slots[4],
    ];
    const fourSnapshot = createStudioRenderSnapshot({
      project: fourTracksProject, expectedRevision: 7, assets: [fiveAssets[0], fiveAssets[1], fiveAssets[3], fiveAssets[4]],
    });
    const fourPaths = new Map<string, string>([
      [fiveAssetIds[0], fivePaths.get(fiveAssetIds[0])!],
      [fiveAssetIds[1], fivePaths.get(fiveAssetIds[1])!],
      [fiveAssetIds[3], fivePaths.get(fiveAssetIds[3])!],
      [fiveAssetIds[4], fivePaths.get(fiveAssetIds[4])!],
    ]);
    const fourRendered = await renderFixturePcm(
      root,
      "two-voice-focus-depth-two-music",
      fourSnapshot,
      fourPaths,
    );
    assert.equal(fourSnapshot.tracks.filter((track) => track.trackKind === "voice").length, 2);
    assert.equal(fourSnapshot.tracks.filter((track) => track.trackKind === "music").length, 2);
    assert.equal(fourSnapshot.tracks[0].voicePreset, "focus");
    assert.equal(fourSnapshot.tracks[1].voicePreset, "depth");
    assert(sampleRangePeak(fourRendered.samples, Math.round(0.1 * RATE), Math.round(0.2 * RATE)) > 1e-6);
    const focusDepthProject = clone(fiveTracksProject);
    focusDepthProject.project_data.tracks = focusDepthProject.project_data.tracks.slice(0, 2);
    focusDepthProject.project_data.slots = focusDepthProject.project_data.slots.slice(0, 2);
    const focusDepthSnapshot = createStudioRenderSnapshot({
      project: focusDepthProject, expectedRevision: 7, assets: fiveAssets.slice(0, 2),
    });
    const focusDepth = await renderFixturePcm(
      root,
      "two-voice-focus-depth",
      focusDepthSnapshot,
      new Map([[fiveAssetIds[0], fivePaths.get(fiveAssetIds[0])!], [fiveAssetIds[1], fivePaths.get(fiveAssetIds[1])!]]),
    );
    assert.equal(focusDepthSnapshot.tracks.map((track) => track.voicePreset).join(","), "focus,depth");
    assert(sampleRangePeak(focusDepth.samples, Math.round(0.2 * RATE), Math.round(0.3 * RATE)) > 1e-6);
    const musicFadesProject = clone(fiveTracksProject);
    musicFadesProject.project_data.tracks = musicFadesProject.project_data.tracks.slice(3, 5);
    musicFadesProject.project_data.slots = musicFadesProject.project_data.slots.slice(3, 5);
    const musicFadesSnapshot = createStudioRenderSnapshot({
      project: musicFadesProject, expectedRevision: 7, assets: [fiveAssets[3], fiveAssets[4]],
    });
    const musicFades = await renderFixturePcm(
      root,
      "two-music-independent-fades",
      musicFadesSnapshot,
      new Map([[fiveAssetIds[3], fivePaths.get(fiveAssetIds[3])!], [fiveAssetIds[4], fivePaths.get(fiveAssetIds[4])!]]),
    );
    assert.equal(musicFadesSnapshot.tracks.every((track) => track.trackKind === "music"), true);
    assert.equal(musicFadesSnapshot.tracks[0].clips.length, 2, "music gap fixture must retain both clips");
    assert(sampleRangePeak(musicFades.samples, Math.round(0.2 * RATE), Math.round(0.3 * RATE)) > 1e-6);

    const clippingProject = clone(fiveTracksProject);
    clippingProject.project_data.tracks.forEach((track) => { track.volume = 4; });
    const clippingSnapshot = createStudioRenderSnapshot({
      project: clippingProject, expectedRevision: 7, assets: fiveAssets,
    });
    const clipped = await renderFixturePcm(root, "clipping-observation", clippingSnapshot, fivePaths);
    assert(
      peak(clipped.samples) > 1,
      `render mixer intentionally remains unclamped before final encoding; observed peak ${peak(clipped.samples)}`,
    );
    const clippedMp3 = await renderFixtureMp3(root, "clipping-observation", clippingSnapshot, fivePaths);
    const decodedClipped = await decodeMp3ToPcmSamples(root, clippedMp3.outputPath);
    const decodedClippedPeak = peak(decodedClipped);
    assert(decodedClippedPeak > 1, `decoded MP3 must retain clipping observation; observed ${decodedClippedPeak}`);

    const presetSummary = (preset: "focus" | "depth" | "trance") => {
      const config = STUDIO_VOICE_PRESET_CONFIG[preset];
      return {
        preset,
        filters: config.filters.map(({ type, frequency, gain, q }) => [type, frequency, gain ?? 0, q]),
        reverb: config.reverb && [
          config.reverb.dryGain, config.reverb.wetGain, config.reverb.wetHighPassFrequency,
          config.reverb.wetLowPassFrequency, config.reverb.impulseDurationSeconds,
        ],
      };
    };
    for (const preset of ["focus", "depth", "trance"] as const) {
      const summary = presetSummary(preset);
      assert.deepEqual(summary, presetSummary(preset), `${preset} summary must be stable`);
      const impulseA = createStudioVoicePresetImpulseWav(preset);
      assert.deepEqual(impulseA, createStudioVoicePresetImpulseWav(preset), `${preset} IR must be deterministic`);
      assert(summary.filters.length > 0 && summary.reverb, `${preset} must retain its configured DSP summary`);
    }

    let successfulWorkspace = "";
    await withStudioRenderWorkspace("success cleanup", async (workspace) => {
      successfulWorkspace = workspace;
      await writeFile(join(workspace, "marker"), "ok");
      await access(join(workspace, "marker"));
    });
    await assertMissing(successfulWorkspace);
    let failedWorkspace = "";
    await assert.rejects(withStudioRenderWorkspace("failure cleanup", async (workspace) => {
      failedWorkspace = workspace;
      await writeFile(join(workspace, "marker"), "fail");
      throw new Error("controlled workspace failure");
    }), /controlled workspace failure/);
    await assertMissing(failedWorkspace);
    const workspacesBeforeFailure = new Set(
      (await readdir(tmpdir())).filter((name) => name.startsWith("audiolad-studio-actual-ffmpeg-failure-")),
    );
    const missingInput = join(root, "missing-input.wav");
    await assert.rejects(
      renderStudioProjectToPcmWav(
        { snapshot: noneSnapshot, localAssetPaths: new Map([[ASSET_VOICE, missingInput], [ASSET_MUSIC, musicPath]]) },
        { renderId: "actual ffmpeg failure", outputDirectory: root },
      ),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : "";
        return /^ffmpeg exited with \d+:/.test(message) && /missing-input\.wav/.test(message);
      },
      "actual FFmpeg failures must expose a normalized executable/exit-code error",
    );
    const workspacesAfterFailure = new Set(
      (await readdir(tmpdir())).filter((name) => name.startsWith("audiolad-studio-actual-ffmpeg-failure-")),
    );
    assert.deepEqual(workspacesAfterFailure, workspacesBeforeFailure, "failed FFmpeg render must clean its workspace");

    const sharedMusicProject = project("none", 1, false);
    sharedMusicProject.project_data.tracks = [
      {
        id: "music-a",
        assetId: ASSET_MUSIC,
        name: "Музыка 1",
        volume: 0.5,
        muted: false,
        trackKind: "music" as const,
        voicePreset: "none" as const,
        clips: [
          { id: "music-a-1", startTime: 0, offset: 0, duration: 1, fadeInDuration: 0, fadeOutDuration: 0 },
          { id: "music-a-2", startTime: 1, offset: 0, duration: 1, fadeInDuration: 0, fadeOutDuration: 0 },
        ],
      },
      {
        id: "music-b",
        assetId: ASSET_MUSIC,
        name: "Музыка 2",
        volume: 0.4,
        muted: false,
        trackKind: "music" as const,
        voicePreset: "none" as const,
        clips: [
          { id: "music-b-1", startTime: 0.5, offset: 0, duration: 1.5, fadeInDuration: 0.1, fadeOutDuration: 0.1 },
        ],
      },
    ];
    sharedMusicProject.project_data.slots = [
      { id: "slot-music-1", name: "Музыка 1", audioTrackId: "music-a", trackKind: "music" as const },
      { id: "slot-music-2", name: "Музыка 2", audioTrackId: "music-b", trackKind: "music" as const },
    ];
    const sharedSnapshot = createStudioRenderSnapshot({
      project: sharedMusicProject,
      expectedRevision: 7,
      assets: [asset(ASSET_MUSIC, musicPath, 3)],
    });
    assert.equal(sharedSnapshot.tracks.length, 2);
    assert.equal(sharedSnapshot.tracks[0].assetId, ASSET_MUSIC);
    assert.equal(sharedSnapshot.tracks[1].assetId, ASSET_MUSIC);
    assert.equal(sharedSnapshot.assets.length, 1);
    assert.equal(sharedSnapshot.tracks[0].clips.length, 2);
    assert.equal(sharedSnapshot.tracks[0].clips[1].startTime, 1);
    const sharedTimeline = buildStudioRenderTimeline(sharedSnapshot);
    assert.equal(sharedTimeline.tracks.length, 2);
    assert.equal(sharedTimeline.durationSeconds, 2);
    validateStudioProjectDocument(sharedMusicProject.project_data);

    const invalidDocument = fixtureProject([
      { id: "valid", startTime: 0, offset: 0, duration: 0.25, fadeInDuration: 0, fadeOutDuration: 0 },
    ]).project_data;
    type InvalidClip = {
      id: string;
      startTime: number;
      offset: number;
      duration: number;
      fadeInDuration: number;
      fadeOutDuration: number;
    };
    type InvalidTrack = { id: string; assetId: string; volume: number; clips: InvalidClip[] };
    const invalidTracks = (document: Record<string, unknown>) => document.tracks as InvalidTrack[];
    const invalidSlots = (document: Record<string, unknown>) =>
      document.slots as Array<{ id: string; audioTrackId: string | null }>;
    const invalidCases: Array<{
      name: string;
      mutate: (document: Record<string, unknown>) => void;
      code: string;
    }> = [
      { name: "schema", mutate: (document) => { document.schemaVersion = 99; }, code: "unsupported_schema_version" },
      { name: "studio-version", mutate: (document) => { document.studioVersion = 99; }, code: "unsupported_studio_version" },
      { name: "unknown-field", mutate: (document) => { document.extra = true; }, code: "unknown_field" },
      { name: "invalid-editor", mutate: (document) => { (document.editor as { currentTime: number }).currentTime = -1; }, code: "invalid_editor" },
      { name: "invalid-slot", mutate: (document) => { invalidSlots(document)[0].audioTrackId = ""; }, code: "invalid_slot" },
      { name: "negative-time", mutate: (document) => { invalidTracks(document)[0].clips[0].startTime = -1; }, code: "invalid_clip" },
      { name: "excess-fades", mutate: (document) => { invalidTracks(document)[0].clips[0].fadeInDuration = 0.2; invalidTracks(document)[0].clips[0].fadeOutDuration = 0.2; }, code: "invalid_clip" },
      { name: "bad-volume", mutate: (document) => { invalidTracks(document)[0].volume = 5; }, code: "invalid_track" },
      { name: "duplicate-track", mutate: (document) => { invalidTracks(document).push(clone(invalidTracks(document)[0])); }, code: "duplicate_track_id" },
      { name: "duplicate-clip", mutate: (document) => { invalidTracks(document)[0].clips.push({ ...invalidTracks(document)[0].clips[0], startTime: 0.25 }); }, code: "duplicate_clip_id" },
      { name: "duplicate-slot", mutate: (document) => { invalidSlots(document).push({ ...clone(invalidSlots(document)[0]), audioTrackId: null }); }, code: "duplicate_slot_id" },
      { name: "duplicate-slot-track", mutate: (document) => { invalidSlots(document).push({ ...clone(invalidSlots(document)[0]), id: "other-slot", audioTrackId: invalidTracks(document)[0].id }); }, code: "duplicate_slot_track" },
      { name: "dangling-slot", mutate: (document) => { invalidSlots(document)[0].audioTrackId = "missing"; }, code: "dangling_slot_track" },
      { name: "overlap", mutate: (document) => { invalidTracks(document)[0].clips.push({ ...invalidTracks(document)[0].clips[0], id: "overlap", startTime: 0.1 }); }, code: "overlapping_clips" },
    ];
    for (const invalidCase of invalidCases) {
      const document = clone(invalidDocument) as unknown as Record<string, unknown>;
      invalidCase.mutate(document);
      assert.throws(
        () => validateStudioProjectDocument(document),
        (error: unknown) => (error as { code?: string }).code === invalidCase.code,
        invalidCase.name,
      );
    }
    assert.throws(
      () => validateStudioProjectDocument(invalidDocument, new Map([[ASSET_VOICE, 0.1]])),
      (error: unknown) => (error as { code?: string }).code === "clip_exceeds_asset_duration",
    );
    assert.throws(
      () => validateStudioProjectDocument(invalidDocument, new Map()),
      (error: unknown) => (error as { code?: string }).code === "missing_asset_duration",
    );
    assert.throws(
      () => validateStudioProjectDocument(invalidDocument, new Map([["", 1]])),
      (error: unknown) => (error as { code?: string }).code === "invalid_asset_duration",
    );
    const presetMetrics = Object.fromEntries(["focus", "depth", "trance"].map((preset) => {
      const config = STUDIO_VOICE_PRESET_CONFIG[preset as "focus" | "depth" | "trance"];
      const impulse = createStudioVoicePresetImpulseWav(preset as "focus" | "depth" | "trance");
      return [preset, {
        filters: config.filters.length,
        impulseFrames: (impulse.length - 44) / 8,
        impulseSeconds: config.reverb?.impulseDurationSeconds,
        wetGain: config.reverb?.wetGain,
        impulseSha256: createHash("sha256").update(impulse).digest("hex"),
      }];
    }));
    console.log(JSON.stringify({
      baseMetrics: {
        mp3Sha256: createHash("sha256").update(firstBytes).digest("hex"),
        clippedPcmPeak: peak(clipped.samples),
        decodedMp3ClippedPeak: decodedClippedPeak,
      },
      presetMetrics,
      output: first,
      metadata,
      productMetadata,
    }, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
