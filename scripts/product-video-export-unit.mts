#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCT_VIDEO_EXPORT_AUTHOR_SLUGS,
  PRODUCT_VIDEO_ORIENTATION_META,
  isProductVideoExportAuthorSlug,
} from "../src/lib/product-video-export/contract.ts";

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

const ui = read("src/components/author-dashboard/AuthorProductVideoExport.tsx");
assert.match(ui, /Видео для площадок/);
assert.match(ui, /Создать MP4 из аудио/);
assert.match(ui, /Скачать MP4/);
assert.match(ui, /Создать заново/);
assert.match(ui, /audio_prepare_status/);
assert.match(ui, /5_000/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AuthorProductVideoExport/);
assert.match(form, /authorSlug=\{selectedAuthor\?\.slug \?\? null\}/);
assert.match(form, /getPracticeId=\{getPracticeIdForCoverUpload\}/);

const ffmpeg = read("src/lib/product-video-export/ffmpeg.ts");
assert.match(ffmpeg, /libx264/);
assert.match(ffmpeg, /aac/);
assert.match(ffmpeg, /yuv420p/);
assert.match(ffmpeg, /\+faststart/);
assert.match(ffmpeg, /-shortest/);

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

console.log("product-video-export-unit: ok");
