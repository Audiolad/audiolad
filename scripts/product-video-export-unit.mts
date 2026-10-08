#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PRODUCT_VIDEO_EXPORT_AUTHOR_SLUGS,
  PRODUCT_VIDEO_EXPORT_PROGRESS_POLL_MS,
  PRODUCT_VIDEO_ORIENTATION_META,
  PRODUCT_VIDEO_RENDER_RECIPE,
  PRODUCT_VIDEO_X264_PRESET,
  isProductVideoExportAuthorSlug,
  isProductVideoRenderJobStale,
  isProductVideoRenderRecipeCurrent,
  productVideoCoverStoragePath,
  productVideoOutputStoragePath,
} from "../src/lib/product-video-export/contract";
import { ProductVideoJobStatus } from "../src/components/author-dashboard/AuthorProductVideoExport";
import {
  PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_FRAMES,
  productVideoAudioIndicatorLayout,
  productVideoAudioIndicatorSource,
  productVideoFilterComplex,
} from "../src/lib/product-video-export/audio-indicator";
import { renderProductVideo } from "../src/lib/product-video-export/ffmpeg";
import {
  PRODUCT_VIDEO_PROGRESS_WRITE_MIN_INTERVAL_MS,
  consumeProductVideoFfmpegProgress,
  createProductVideoFfmpegProgressState,
  createProductVideoProgressPersister,
  parseProductVideoOutTimeUs,
  productVideoPercentFromProgress,
  productVideoRenderStatusView,
} from "../src/lib/product-video-export/progress";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

assert.deepEqual([...PRODUCT_VIDEO_EXPORT_AUTHOR_SLUGS], [
  "sergey-and-zoya",
  "sergey-petrov",
  "zoya-petrova",
]);
for (const slug of PRODUCT_VIDEO_EXPORT_AUTHOR_SLUGS) {
  assert.equal(isProductVideoExportAuthorSlug(slug), true);
}
assert.equal(isProductVideoExportAuthorSlug("other-author"), false);
assert.equal(isProductVideoExportAuthorSlug(null), false);

assert.equal(PRODUCT_VIDEO_ORIENTATION_META.landscape_16_9.width, 1920);
assert.equal(PRODUCT_VIDEO_ORIENTATION_META.landscape_16_9.height, 1080);
assert.equal(PRODUCT_VIDEO_ORIENTATION_META.portrait_9_16.width, 1080);
assert.equal(PRODUCT_VIDEO_ORIENTATION_META.portrait_9_16.height, 1920);
assert.equal(
  PRODUCT_VIDEO_ORIENTATION_META.landscape_16_9.coverLabel,
  "Видеообложка 16:9 (горизонтальное видео — YouTube / VK Видео)",
);
assert.equal(
  PRODUCT_VIDEO_ORIENTATION_META.portrait_9_16.coverLabel,
  "Видеообложка 9:16 (вертикальное видео — Reels / YouTube Shorts / VK Клипы)",
);

const samplePractice = "31e04472-2693-4986-a973-3600d9a2e4a7";
const sampleToken = "1a47fdcd-0f93-46dd-bb7c-04e1358f77b7";
const landscapePath = productVideoCoverStoragePath(
  samplePractice,
  "landscape_16_9",
  sampleToken,
);
const portraitPath = productVideoCoverStoragePath(
  samplePractice,
  "portrait_9_16",
  sampleToken,
);
const outputPath = productVideoOutputStoragePath(
  samplePractice,
  sampleToken,
  "landscape_16_9",
  sampleToken,
);
assert.equal(
  landscapePath,
  `practices/${samplePractice}/video-covers/landscape_16_9/${sampleToken}.webp`,
);
assert.equal(
  portraitPath,
  `practices/${samplePractice}/video-covers/portrait_9_16/${sampleToken}.webp`,
);
assert.match(
  landscapePath,
  /^practices\/[0-9a-f-]{36}\/video-covers\/landscape_16_9\/[0-9a-f-]{36}\.webp$/,
);
assert.match(
  portraitPath,
  /^practices\/[0-9a-f-]{36}\/video-covers\/portrait_9_16\/[0-9a-f-]{36}\.webp$/,
);
assert.match(
  outputPath,
  /^practices\/[0-9a-f-]{36}\/video\/[0-9a-f-]{36}\/landscape_16_9\/[0-9a-f-]{36}\.mp4$/,
);

const ui = read("src/components/author-dashboard/AuthorProductVideoExport.tsx");
assert.match(ui, /Видео для площадок/);
assert.match(ui, /Создать MP4 из аудио/);
assert.match(ui, /Скачать MP4/);
assert.match(ui, /Создать заново/);
assert.match(ui, /audio_prepare_status/);
assert.match(ui, /PRODUCT_VIDEO_EXPORT_PROGRESS_POLL_MS/);
assert.match(ui, /role="progressbar"/);
assert.match(ui, /motion-reduce:transition-none/);
assert.match(ui, /video_cover_path_rejected/);
assert.match(ui, /video_cover_persist_failed/);
assert.match(ui, /Не удалось создать видео\. Попробуйте ещё раз\./);
assert.equal(PRODUCT_VIDEO_EXPORT_PROGRESS_POLL_MS, 2_000);
assert.equal(PRODUCT_VIDEO_PROGRESS_WRITE_MIN_INTERVAL_MS, 1_000);
assert.equal(PRODUCT_VIDEO_X264_PRESET, "veryfast");

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AuthorProductVideoExport/);
assert.match(form, /authorSlug=\{selectedAuthor\?\.slug \?\? null\}/);
assert.match(form, /getPracticeId=\{getPracticeIdForCoverUpload\}/);

const ffmpeg = read("src/lib/product-video-export/ffmpeg.ts");
assert.match(ffmpeg, /libx264/);
assert.match(ffmpeg, /aac/);
assert.match(ffmpeg, /-b:a/);
assert.match(ffmpeg, /192k/);
assert.match(ffmpeg, /yuv420p/);
assert.match(ffmpeg, /\+faststart/);
assert.match(ffmpeg, /-shortest/);
assert.match(ffmpeg, /-progress/);
assert.match(ffmpeg, /pipe:1/);
assert.match(ffmpeg, /PRODUCT_VIDEO_X264_PRESET/);
assert.match(ffmpeg, /onProgress/);
assert.doesNotMatch(ffmpeg, /"-preset",\s*"medium"/);
assert.match(ffmpeg, /"-filter_complex"/);
assert.match(ffmpeg, /"\[vout\]"/);
assert.match(ffmpeg, /"-tune",\s*"stillimage"/);
assert.match(ffmpeg, /productVideoFilterComplex\(orientation\)/);
assert.doesNotMatch(ffmpeg, /"-vf"/);
assert.match(ffmpeg, /"-t", \(knownDurationUs \/ 1_000_000\)\.toFixed\(3\)/);

// «Это аудио» indicator: compact, bottom-right, inside the frame, same
// physical size in both orientations, clear of platform controls.
assert.deepEqual(productVideoAudioIndicatorLayout("landscape_16_9"), {
  frameWidth: 1920,
  frameHeight: 1080,
  width: 156,
  height: 86,
  marginRight: 68,
  marginBottom: 118,
  x: 1696,
  y: 876,
});
assert.deepEqual(productVideoAudioIndicatorLayout("portrait_9_16"), {
  frameWidth: 1080,
  frameHeight: 1920,
  width: 156,
  height: 86,
  marginRight: 140,
  marginBottom: 364,
  x: 784,
  y: 1470,
});
for (const orientation of ["landscape_16_9", "portrait_9_16"] as const) {
  const layout = productVideoAudioIndicatorLayout(orientation);
  assert.ok(layout.x > layout.frameWidth / 2, "indicator is on the right half");
  assert.ok(layout.y > layout.frameHeight / 2, "indicator is on the bottom half");
  assert.ok(layout.x + layout.width <= layout.frameWidth);
  assert.ok(layout.y + layout.height <= layout.frameHeight);
  assert.ok(layout.width * layout.height < 0.01 * layout.frameWidth * layout.frameHeight);
  const source = productVideoAudioIndicatorSource(orientation);
  assert.match(source, /^color=c=black@0:s=156x86:r=25:d=2\.4,format=rgba,geq=/);
  assert.match(source, /format=yuva420p,loop=loop=-1:size=60:start=0\[aind\]$/);
  assert.doesNotMatch(source, /NaN|undefined|Infinity/);
  const graph = productVideoFilterComplex(orientation);
  assert.match(graph, /^\[0:v\]scale=\d+:\d+:force_original_aspect_ratio=increase,crop=\d+:\d+\[avbg\];/);
  assert.ok(graph.includes(`overlay=x=${layout.x}:y=${layout.y}:format=yuv420,format=yuv420p[vout]`));
  assert.doesNotMatch(graph, /format=auto/);
  // Decorative, deterministic animation: only frame time T drives the bars.
  assert.doesNotMatch(graph, /showfreqs|showspectrum|showwaves|astats|\[1:a\]/);
}
assert.equal(PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_FRAMES, 60);

// Render recipe: old completed MP4s (NULL / other recipe) are not current.
assert.equal(PRODUCT_VIDEO_RENDER_RECIPE, "cover-audio-indicator-v1");
assert.equal(isProductVideoRenderRecipeCurrent(PRODUCT_VIDEO_RENDER_RECIPE), true);
assert.equal(isProductVideoRenderRecipeCurrent(null), false);
assert.equal(isProductVideoRenderRecipeCurrent(undefined), false);
const freshJob = {
  status: "completed",
  sourceAudioPath: "a.mp3",
  sourceCoverPath: "c.webp",
  renderRecipe: PRODUCT_VIDEO_RENDER_RECIPE,
  currentAudioPath: "a.mp3",
  currentCoverPath: "c.webp",
};
assert.equal(isProductVideoRenderJobStale(freshJob), false);
assert.equal(isProductVideoRenderJobStale({ ...freshJob, renderRecipe: null }), true);
assert.equal(isProductVideoRenderJobStale({ ...freshJob, renderRecipe: "cover-v0" }), true);
assert.equal(isProductVideoRenderJobStale({ ...freshJob, currentAudioPath: "b.mp3" }), true);
assert.equal(isProductVideoRenderJobStale({ ...freshJob, currentCoverPath: null }), true);
for (const status of ["queued", "processing", "failed"]) {
  assert.equal(
    isProductVideoRenderJobStale({ ...freshJob, status, renderRecipe: null }),
    false,
    `${status} job is rendered by the current worker`,
  );
}
const recipeMigration = read(
  "supabase/migrations/20261225120000_product_video_render_recipe.sql",
);
assert.match(recipeMigration, /ADD COLUMN IF NOT EXISTS render_recipe text NULL/);
assert.doesNotMatch(recipeMigration, /UPDATE public\.product_video_render_jobs/);
assert.doesNotMatch(recipeMigration, /CREATE OR REPLACE FUNCTION/);

const migration = read(
  "supabase/migrations/20261220125000_product_video_export.sql",
);
assert.match(migration, /product_video_assets/);
assert.match(migration, /product_video_render_jobs/);
assert.match(migration, /product-video-assets/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /claim_product_video_render_job/);
assert.match(migration, /renew_product_video_render_job_lease/);
assert.match(migration, /service_role/);

const pathFix = read(
  "supabase/migrations/20261220131000_product_video_cover_path_check_fix.sql",
);
assert.match(pathFix, /product_video_assets_landscape_path_check/);
assert.match(pathFix, /\[\.\]webp/);
assert.match(pathFix, /\[\.\]mp4/);
assert.match(
  pathFix,
  /DROP CONSTRAINT IF EXISTS product_video_assets_landscape_path_check/,
);
assert.match(
  pathFix,
  /DROP CONSTRAINT IF EXISTS product_video_render_jobs_output_path_check/,
);

const serverSrc = read("src/lib/product-video-export/server.ts");
assert.match(serverSrc, /video_cover_path_rejected/);
assert.match(serverSrc, /video_cover_persist_failed/);
assert.match(serverSrc, /product_video_cover_update_error/);
assert.match(serverSrc, /progress_percent/);
assert.match(serverSrc, /render_recipe/);
assert.match(serverSrc, /isProductVideoRenderJobStale\(/);

const progressMigration = read(
  "supabase/migrations/20261220140000_product_video_render_progress.sql",
);
assert.match(progressMigration, /ADD COLUMN IF NOT EXISTS progress_percent smallint/);
assert.match(progressMigration, /report_product_video_render_progress/);
assert.match(progressMigration, /guard_product_video_render_job_progress/);
assert.match(progressMigration, /product_video_render_jobs_progress_guard/);
assert.match(progressMigration, /product_video_render_jobs_progress_percent_check/);
assert.match(progressMigration, /status = 'queued' AND progress_percent IS NULL/);
assert.match(progressMigration, /status = 'completed' AND progress_percent = 100/);
assert.match(progressMigration, /BETWEEN 0 AND 99/);
assert.match(progressMigration, /NEW\.progress_percent < OLD\.progress_percent/);
assert.match(progressMigration, /LEAST\(GREATEST\(p_progress_percent, 0\), 99\)/);
assert.match(progressMigration, /lease_expires_at > clock_timestamp\(\)/);
assert.match(progressMigration, /TO service_role/);
assert.match(progressMigration, /FROM PUBLIC, anon, authenticated/);
assert.doesNotMatch(progressMigration, /\\\\/);
assert.doesNotMatch(
  progressMigration,
  /CREATE OR REPLACE FUNCTION public\.(claim|recover_stale|renew|enqueue)_product_video_render_job/,
);

const workerRuntime = read("src/lib/product-video-export/worker-runtime.ts");
assert.match(workerRuntime, /report_product_video_render_progress/);
assert.match(workerRuntime, /progress_percent: 100/);
assert.match(workerRuntime, /render_recipe: PRODUCT_VIDEO_RENDER_RECIPE/);
assert.match(workerRuntime, /createProductVideoProgressPersister/);
assert.match(workerRuntime, /PRODUCT_VIDEO_PROGRESS_WRITE_MIN_INTERVAL_MS/);

assert.equal(parseProductVideoOutTimeUs("00:01:02.500000"), 62_500_000);
assert.equal(parseProductVideoOutTimeUs("-00:00:00.100000"), null);
assert.equal(productVideoPercentFromProgress(0, 960_000_000), 0);
assert.equal(productVideoPercentFromProgress(480_000_000, 960_000_000), 50);
assert.equal(productVideoPercentFromProgress(959_000_000, 960_000_000), 99);
assert.equal(productVideoPercentFromProgress(2_000_000_000, 960_000_000), 99);
assert.equal(productVideoPercentFromProgress(-1, 960_000_000), null);
assert.equal(productVideoPercentFromProgress(10, 0), null);

const splitState = createProductVideoFfmpegProgressState();
assert.deepEqual(
  consumeProductVideoFfmpegProgress(splitState, "out_time_us=12"),
  [],
);
const continued = consumeProductVideoFfmpegProgress(
  splitState,
  "0000\nout_time=00:00:00.120000\nprogress=continue\n",
);
assert.equal(continued.length, 1);
assert.equal(continued[0]?.positionUs, 120_000);
const clockOnly = createProductVideoFfmpegProgressState();
const clockSample = consumeProductVideoFfmpegProgress(
  clockOnly,
  "out_time_ms=999999\nout_time=00:00:03.000000\nprogress=continue\n",
);
assert.equal(clockSample[0]?.positionUs, 3_000_000);

const monotonic: number[] = [];
let cursor = 0;
const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
const persister = createProductVideoProgressPersister({
  minIntervalMs: 1_000,
  now: () => cursor,
  schedule: (fn, ms) => {
    const entry = { fn, ms, cancelled: false };
    timers.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
      },
    };
  },
  write: (percent) => {
    monotonic.push(percent);
  },
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
persister.note(0);
persister.note(4);
persister.note(2);
persister.note(9);
await tick();
assert.deepEqual(monotonic, [0]);
assert.equal(timers.length, 1);
assert.equal(timers[0]?.cancelled, false);
cursor = 1_000;
timers[0]?.fn();
await tick();
assert.deepEqual(monotonic, [0, 9]);
persister.note(8);
await tick();
assert.deepEqual(monotonic, [0, 9]);
cursor = 2_000;
persister.note(40);
await tick();
assert.deepEqual(monotonic, [0, 9, 40]);
persister.note(55);
await persister.settle();
assert.deepEqual(monotonic, [0, 9, 40, 55]);
assert.ok(monotonic.every((value, index) => index === 0 || value > monotonic[index - 1]!));

assert.deepEqual(
  productVideoRenderStatusView({
    status: "queued",
    stale: false,
    progressPercent: 12,
  }),
  { label: "В очереди", percent: null, showBar: false, animate: false },
);
assert.equal(
  productVideoRenderStatusView({
    status: "processing",
    stale: false,
    progressPercent: null,
  }).percent,
  null,
);
assert.deepEqual(
  productVideoRenderStatusView({
    status: "processing",
    stale: false,
    progressPercent: 42,
  }),
  { label: "Создаётся", percent: 42, showBar: true, animate: true },
);
assert.equal(
  productVideoRenderStatusView({
    status: "processing",
    stale: false,
    progressPercent: 100,
  }).percent,
  null,
);
assert.deepEqual(
  productVideoRenderStatusView({
    status: "completed",
    stale: false,
    progressPercent: null,
  }),
  { label: "Готово", percent: 100, showBar: true, animate: true },
);
assert.equal(
  productVideoRenderStatusView({
    status: "failed",
    stale: false,
    progressPercent: 37,
  }).animate,
  false,
);

function markup(state: {
  status: "queued" | "processing" | "completed" | "failed" | "superseded";
  stale?: boolean;
  progress_percent: number | null;
  error_message_safe?: string | null;
}) {
  return renderToStaticMarkup(
    createElement(ProductVideoJobStatus, {
      state: {
        id: "job-1",
        status: state.status,
        stale: state.stale === true,
        error_message_safe: state.error_message_safe ?? null,
        progress_percent: state.progress_percent,
      },
    }),
  );
}

const queuedHtml = markup({ status: "queued", progress_percent: null });
assert.match(queuedHtml, /В очереди/);
assert.doesNotMatch(queuedHtml, /%/);
assert.doesNotMatch(queuedHtml, /progressbar/);

const processingHtml = markup({ status: "processing", progress_percent: 42 });
assert.match(processingHtml, /Создаётся/);
assert.match(processingHtml, /42%/);
assert.match(processingHtml, /progressbar/);
assert.match(processingHtml, /width:42%/);
assert.match(processingHtml, /motion-reduce:transition-none/);
assert.match(processingHtml, /motion-safe:transition-\[width\]/);

const doneHtml = markup({ status: "completed", progress_percent: 100 });
assert.match(doneHtml, /Готово/);
assert.match(doneHtml, /100%/);

const failedHtml = markup({ status: "failed", progress_percent: 18 });
assert.match(failedHtml, /Ошибка/);
assert.match(failedHtml, /18%/);
assert.doesNotMatch(failedHtml, /motion-safe:transition/);

const ffmpegBin = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
if (ffmpegBin.status !== 0) {
  console.log("product-video-export-unit: ffmpeg progress render skipped");
} else {
  const dir = await mkdtemp(path.join(tmpdir(), "audiolad-pvideo-progress-"));
  try {
    const cover = path.join(dir, "cover.png");
    const audio = path.join(dir, "audio.mp3");
    const output = path.join(dir, "out.mp4");
    const coverRun = spawnSync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x7042c5:s=320x180", "-frames:v", "1", cover],
      { encoding: "utf8" },
    );
    assert.equal(coverRun.status, 0, coverRun.stderr);
    const audioRun = spawnSync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=20", "-c:a", "libmp3lame", "-b:a", "128k", audio],
      { encoding: "utf8" },
    );
    assert.equal(audioRun.status, 0, audioRun.stderr);
    const seen: number[] = [];
    await renderProductVideo({
      audioPath: audio,
      coverPath: cover,
      outputPath: output,
      orientation: "landscape_16_9",
      onProgress: (percent) => seen.push(percent),
    });
    assert.ok(seen.length >= 2, `expected ffmpeg progress samples, got ${seen.join(",")}`);
    assert.ok(seen.every((value) => value >= 0 && value <= 99));
    assert.ok(seen.every((value, index) => index === 0 || value >= seen[index - 1]!));
    assert.ok((seen[seen.length - 1] ?? 0) >= 50, `progress did not advance, got ${seen.join(",")}`);
    const probe = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type", "-of", "json", output],
      { encoding: "utf8" },
    );
    assert.equal(probe.status, 0, probe.stderr);
    const parsed = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_name?: string; codec_type?: string }>;
    };
    const duration = Number(parsed.format?.duration);
    assert.ok(duration > 19.5 && duration < 20.5, `duration ${duration}`);
    const streamDurations = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "csv=p=0", output],
      { encoding: "utf8" },
    ).stdout.trim().split("\n");
    for (const line of streamDurations) {
      const seconds = Number(line.split(",")[1]);
      assert.ok(Math.abs(seconds - 20) <= 0.1, `stream duration ${line}`);
    }
    assert.ok(parsed.streams?.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac"));
    assert.ok(parsed.streams?.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264"));

    // Indicator pixels: present at t=0, animated, and nothing else touched.
    for (const orientation of ["landscape_16_9", "portrait_9_16"] as const) {
      const layout = productVideoAudioIndicatorLayout(orientation);
      const greyCover = path.join(dir, `grey-${orientation}.png`);
      const shortAudio = path.join(dir, "short.mp3");
      const clip = path.join(dir, `clip-${orientation}.mp4`);
      assert.equal(
        spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x808080:s=${layout.frameWidth}x${layout.frameHeight}`, "-frames:v", "1", greyCover]).status,
        0,
      );
      assert.equal(
        spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=3", "-c:a", "libmp3lame", "-b:a", "128k", shortAudio]).status,
        0,
      );
      await renderProductVideo({ audioPath: shortAudio, coverPath: greyCover, outputPath: clip, orientation });
      const frameAt = (seconds: number) => {
        const run = spawnSync(
          "ffmpeg",
          ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", clip, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
          { maxBuffer: 16 * 1024 * 1024 },
        );
        assert.equal(run.status, 0, String(run.stderr));
        assert.equal(run.stdout.length, layout.frameWidth * layout.frameHeight);
        return run.stdout as Buffer;
      };
      const region = (frame: Buffer, x0: number, y0: number, w: number, h: number) => {
        const out: number[] = [];
        for (let y = y0; y < y0 + h; y += 1) {
          for (let x = x0; x < x0 + w; x += 1) out.push(frame[y * layout.frameWidth + x]!);
        }
        return out;
      };
      const first = frameAt(0);
      const later = frameAt(0.6);
      const box = (frame: Buffer) => region(frame, layout.x, layout.y, layout.width, layout.height);
      const grey = 0x80;
      const changedFromCover = box(first).filter((v) => Math.abs(v - grey) > 24).length;
      assert.ok(changedFromCover > layout.width * layout.height * 0.5, `${orientation}: indicator missing in first frame`);
      const firstBox = box(first);
      const laterBox = box(later);
      const animated = firstBox.filter((v, i) => Math.abs(v - laterBox[i]!) > 24).length;
      assert.ok(animated > 20, `${orientation}: indicator bars did not move (${animated})`);
      assert.ok(animated < firstBox.length * 0.25, `${orientation}: indicator flickers (${animated})`);
      const topLeft = region(first, 0, 0, 200, 200);
      assert.ok(topLeft.every((v) => Math.abs(v - grey) <= 3), `${orientation}: cover outside indicator changed`);
      const probeClip = spawnSync(
        "ffprobe",
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt", "-of", "csv=p=0", clip],
        { encoding: "utf8" },
      );
      assert.equal(probeClip.stdout.trim(), `${layout.frameWidth},${layout.frameHeight},yuv420p`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const deploy = read("deploy/scripts/deploy.sh");
assert.match(deploy, /assert_product_video_export_worker_release_tree/);
assert.match(deploy, /ensure-product-video-export-worker\.sh/);
assert.match(deploy, /product-video-export-worker\.ecosystem\.config\.cjs/);
const ensureWorker = read("deploy/scripts/ensure-product-video-export-worker.sh");
assert.match(ensureWorker, /audiolad-product-video-export-worker/);
assert.match(ensureWorker, /pm2_status/);
assert.match(ensureWorker, /product_video_export_worker_online/);

console.log("product-video-export-unit: ok");
