#!/usr/bin/env node
/**
 * Unit checks for private audio MVP (validation, limits, paths, progress).
 * Run: node scripts/private-audio-mvp-unit.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

const PRIVATE_AUDIO_LIMITS = {
  maxItemsPerUser: 5,
  maxTotalBytesPerUser: 250 * 1024 * 1024,
  maxAudioBytes: 50 * 1024 * 1024,
  maxCoverBytes: 5 * 1024 * 1024,
  titleMaxLength: 120,
  authorTextMaxLength: 120,
};

const ALLOWED_MP3_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
  "application/octet-stream",
]);

const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isAllowedPrivateMp3File(file) {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();
  if (!name.endsWith(".mp3")) return false;
  if (!mime) return true;
  return ALLOWED_MP3_MIME_TYPES.has(mime);
}

function isAllowedPrivateCoverFile(file) {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();
  if (
    !name.endsWith(".jpg") &&
    !name.endsWith(".jpeg") &&
    !name.endsWith(".png") &&
    !name.endsWith(".webp")
  ) {
    return false;
  }
  if (!mime) return true;
  return ALLOWED_COVER_MIME_TYPES.has(mime);
}

function normalizePrivateTitle(value) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > PRIVATE_AUDIO_LIMITS.titleMaxLength) return null;
  return trimmed;
}

function normalizePrivateAuthorText(value) {
  if (value == null) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > PRIVATE_AUDIO_LIMITS.authorTextMaxLength) return null;
  return trimmed;
}

function wouldExceedPrivateAudioQuota(input) {
  const nextItems = input.currentItemCount + (input.additionalItems ?? 1);
  const nextBytes = input.currentTotalBytes + input.additionalBytes;
  return (
    nextItems > PRIVATE_AUDIO_LIMITS.maxItemsPerUser ||
    nextBytes > PRIVATE_AUDIO_LIMITS.maxTotalBytesPerUser
  );
}

function mergeNoRegressProgress(input) {
  return {
    positionSeconds: Math.max(input.currentPosition, input.nextPosition),
    completed: input.currentCompleted || input.nextCompleted,
  };
}

function testSourceGuards() {
  const migration = read(
    "supabase/migrations/20260729190000_private_audio_items.sql",
  );
  assert(
    migration.includes("CREATE TABLE IF NOT EXISTS public.private_audio_items"),
    "items table",
  );
  assert(
    migration.includes(
      "CREATE TABLE IF NOT EXISTS public.private_audio_item_progress",
    ),
    "progress table",
  );
  assert(migration.includes("private-audio-items"), "storage bucket");
  assert(
    migration.includes("Owners can select own private audio items"),
    "owner select policy",
  );
  assert(migration.includes("GREATEST("), "no-regress progress");
  assert(
    !migration.includes("REFERENCES public.practices"),
    "no practices FK",
  );

  const limits = read("src/lib/private-audio/limits.ts");
  assert(limits.includes("maxItemsPerUser: 5"), "limits items");
  assert(limits.includes("250 * 1024 * 1024"), "limits bytes");
  assert(limits.includes("signedUrlTtlSeconds: 900"), "signed ttl");

  const uploads = read("src/lib/private-audio/server/uploads.ts");
  assert(
    uploads.includes("removeStorageObjects(uploadedPaths)"),
    "orphan cleanup on create fail",
  );
  assert(uploads.includes("wouldExceedPrivateAudioQuota"), "quota check");
  assert(
    uploads.includes("cleanupPrivateAudioStorageForUser"),
    "account cleanup helper",
  );

  const route = read("src/app/api/my-library/private-audio/route.ts");
  assert(route.includes("requirePrivateAudioUser"), "auth gate");
  assert(
    route.includes("createPrivateAudioItemWithUpload"),
    "create via upload service",
  );

  const audioRoute = read(
    "src/app/api/my-library/private-audio/[id]/audio/route.ts",
  );
  assert(
    audioRoute.includes("getOwnedPrivateAudioItem"),
    "ownership before signed URL",
  );

  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  assert(library.includes("Мои загрузки"), "uploads filter");
  assert(library.includes("Добавить своё аудио"), "add CTA");

  const offer = read("src/app/offer/page.tsx");
  assert(offer.includes("section-private-audio"), "legal section");
  assert(
    offer.includes("Личные аудиоматериалы пользователя"),
    "legal title",
  );

  const robots = read("src/lib/seo/robots-config.ts");
  assert(robots.includes('"/my-library/"'), "robots disallow");

  const deletion = read("src/lib/admin/user-deletion.ts");
  assert(
    deletion.includes("cleanupPrivateAudioStorageForUser"),
    "admin deletion cleans private audio",
  );

  const reset = read("src/lib/admin/test-user-reset/reset.ts");
  assert(
    reset.includes("cleanupPrivateAudioStorageForUser"),
    "test user reset cleans private audio",
  );

  const player = read(
    "src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx",
  );
  assert(player.includes("ariaLabel"), "shared player ariaLabel");

  const form = read("src/components/private-audio/PrivateAudioForm.tsx");
  assert(!form.includes("service-role"), "form does not import service role");
  assert(
    !form.includes("createServiceRoleClient"),
    "form no service role client",
  );

  const clientApi = read("src/lib/private-audio/client/api.ts");
  assert(
    clientApi.includes('response.status === 413'),
    "client maps HTTP 413 from proxy/nginx",
  );
  assert(
    clientApi.includes("file_too_large"),
    "413 maps to file_too_large for UI",
  );

  const messages = read("src/lib/private-audio/error-messages.ts");
  assert(
    messages.includes("Файл превышает допустимый размер."),
    "user-facing oversized file message",
  );
  assert(
    messages.includes("Код ошибки:"),
    "unknown errors expose short op code",
  );

  const nginxSnippet = read(
    "deploy/nginx/private-audio-upload.location.conf",
  );
  assert(
    nginxSnippet.includes("location = /api/my-library/private-audio"),
    "nginx create-upload location documented",
  );
  assert(
    nginxSnippet.includes("client_max_body_size 55m"),
    "nginx allows 55m for private audio create",
  );
  assert(
    nginxSnippet.includes(
      "location ~ ^/api/my-library/private-audio/[^/]+/cover$",
    ),
    "nginx cover-upload location documented",
  );

  const logging = read("src/lib/private-audio/server/logging.ts");
  assert(logging.includes("createPrivateAudioOpId"), "op id helper");
  assert(logging.includes("private_audio_failure"), "structured failure log");
  assert(logging.includes("ffprobe"), "ffprobe stage");
  assert(logging.includes("storage_audio"), "storage_audio stage");

  const detail = read(
    "src/components/private-audio/PrivateAudioDetailClient.tsx",
  );
  assert(
    !detail.includes("createServiceRoleClient"),
    "detail no service role",
  );

  const storage = read("src/lib/private-audio/storage.ts");
  assert(storage.includes("PRIVATE_AUDIO_BUCKET"), "bucket const");
  assert(storage.includes("/audio/"), "audio path segment");
  assert(storage.includes("/cover/"), "cover path segment");
}

function testValidationLogic() {
  assert(isAllowedPrivateMp3File({ name: "track.mp3", type: "audio/mpeg" }), "mp3");
  assert(!isAllowedPrivateMp3File({ name: "track.wav", type: "audio/wav" }), "wav");
  assert(
    isAllowedPrivateCoverFile({ name: "a.jpg", type: "image/jpeg" }),
    "jpg",
  );
  assert(
    !isAllowedPrivateCoverFile({ name: "a.gif", type: "image/gif" }),
    "gif",
  );
  assert(normalizePrivateTitle("  Hello  ") === "Hello", "title");
  assert(normalizePrivateTitle("") === null, "empty title");
  assert(normalizePrivateAuthorText("  Source ") === "Source", "author");
  assert(
    wouldExceedPrivateAudioQuota({
      currentItemCount: 5,
      currentTotalBytes: 0,
      additionalBytes: 1,
    }),
    "item quota",
  );
  assert(
    wouldExceedPrivateAudioQuota({
      currentItemCount: 0,
      currentTotalBytes: 250 * 1024 * 1024,
      additionalBytes: 1,
    }),
    "bytes quota",
  );
  assert(
    !wouldExceedPrivateAudioQuota({
      currentItemCount: 0,
      currentTotalBytes: 0,
      additionalBytes: 1024,
    }),
    "under quota",
  );

  const merged = mergeNoRegressProgress({
    currentPosition: 100,
    currentCompleted: false,
    nextPosition: 40,
    nextCompleted: false,
  });
  assert(merged.positionSeconds === 100, "no regress");
  assert(merged.completed === false, "not completed");

  const sticky = mergeNoRegressProgress({
    currentPosition: 10,
    currentCompleted: true,
    nextPosition: 20,
    nextCompleted: false,
  });
  assert(sticky.completed === true, "completed sticky");
  assert(sticky.positionSeconds === 20, "position advances");

  const owner = "11111111-1111-4111-8111-111111111111";
  const item = "22222222-2222-4222-8222-222222222222";
  const audioPath = `${owner}/${item}/audio/${randomUUID()}.mp3`;
  const coverPath = `${owner}/${item}/cover/${randomUUID()}.webp`;
  assert(audioPath.split("/").length === 4, "audio segments");
  assert(coverPath.endsWith(".webp"), "cover webp");
}

function main() {
  testSourceGuards();
  testValidationLogic();
  console.log("private-audio-mvp-unit: ok");
}

main();
