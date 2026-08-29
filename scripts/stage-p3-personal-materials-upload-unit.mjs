#!/usr/bin/env node
/**
 * Upload unit checks for personal materials: format matrix, storage, errors,
 * replacement order, and author-product isolation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isAllowedMp3File } from "../src/lib/author-products/media.ts";
import {
  getPersonalMaterialAudioDownloadFallbackFilename,
  getPersonalMaterialAudioFileIssue,
  PERSONAL_MATERIAL_AUDIO_INPUT_ACCEPT,
  resolvePersonalMaterialAudioFormat,
} from "../src/lib/personal-materials/audio-format.ts";
import { formatClientDisplayName } from "../src/lib/personal-materials/display-name.ts";
import {
  buildPersonalMaterialAudioPath,
  isPathInsidePersonalMaterialRoot,
  resolveReplacedPersonalMaterialStoragePath,
} from "../src/lib/personal-materials/storage.ts";
import {
  getPersonalMaterialActivationErrorMessage,
  getPersonalMaterialErrorMessage,
  getPersonalMaterialPdfUploadErrorMessage,
  getPersonalMaterialUploadErrorMessage,
  PersonalMaterialClientError,
  PERSONAL_MATERIAL_SUPPORT_MUTATION_BLOCKED_MESSAGE,
  PERSONAL_MATERIAL_UPLOAD_SERVER_ERROR_MESSAGE,
} from "../src/lib/personal-materials/client/errors.ts";
import {
  isAllowedClientAudioFile,
  resolvePersonalMaterialAudioFormat as clientResolveFormat,
  validatePersonalMaterialForm,
} from "../src/lib/personal-materials/client/validation.ts";
import {
  parseCreatePersonalMaterialBody,
  parseUpdatePersonalMaterialBody,
} from "../src/lib/personal-materials/server/validation.ts";
import { PERSONAL_MATERIAL_LIMITS } from "../src/lib/personal-materials/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTHOR_ID = "00000000-0000-4000-8000-000000000002";
const MATERIAL_ID = "00000000-0000-4000-8000-000000000001";

function file(name, type, size = 1024) {
  return { name, type, size };
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assertAccepted(name, type, expected) {
  const input = file(name, type);
  const resolved = resolvePersonalMaterialAudioFormat(input);
  const clientResolved = clientResolveFormat(input);

  assert.deepEqual(resolved, expected, `server format: ${name} ${type || "empty"}`);
  assert.deepEqual(clientResolved, expected, `client format: ${name} ${type || "empty"}`);
  assert.equal(isAllowedClientAudioFile(input), true, `client allow: ${name}`);
}

function assertRejected(name, type) {
  const input = file(name, type);
  assert.equal(resolvePersonalMaterialAudioFormat(input), null, `server reject: ${name} ${type}`);
  assert.equal(clientResolveFormat(input), null, `client reject: ${name} ${type}`);
  assert.equal(isAllowedClientAudioFile(input), false, `client deny: ${name}`);
}

// Last name optional
const createNoLastName = parseCreatePersonalMaterialBody({
  authorId: AUTHOR_ID,
  materialType: "diagnostic",
  clientFirstName: "Райля",
  clientLastName: "",
  materialDate: "2026-07-15",
});
assert.equal(createNoLastName.clientFirstName, "Райля");
assert.equal(createNoLastName.clientLastName, null);

const updateNoLastName = parseUpdatePersonalMaterialBody({
  clientLastName: "   ",
});
assert.equal(updateNoLastName.clientLastName, null);

const formNoLastName = validatePersonalMaterialForm({
  materialType: "diagnostic",
  clientFirstName: "Райля",
  clientLastName: "",
  materialDate: "2026-07-15",
  title: "",
  description: "",
  personalRecommendation: "",
  returnUrl: "",
  returnButtonLabel: "",
});
assert.equal(Object.keys(formNoLastName).length, 0);

assert.equal(formatClientDisplayName("Райля", null), "Райля");
assert.equal(formatClientDisplayName("Анна", "Иванова"), "Анна Иванова");
assert.equal(formatClientDisplayName("Райля", ""), "Райля");

// Shared client/server format matrix
const mp3 = { extension: "mp3", mimeType: "audio/mpeg" };
const m4a = { extension: "m4a", mimeType: "audio/mp4" };

assertAccepted("foo.mp3", "audio/mpeg", mp3);
assertAccepted("foo.MP3", "audio/mpeg", mp3);
assertAccepted("Райля.mp3", "audio/mp3", mp3);
assertAccepted("Райля.mp3", "audio/x-mpeg", mp3);
assertAccepted("Райля.mp3", "audio/x-mp3", mp3);
assertAccepted("foo.mp3", "application/octet-stream", mp3);
assertAccepted("foo.mp3", "", mp3);

assertAccepted("foo.m4a", "audio/mp4", m4a);
assertAccepted("foo.m4a", "audio/x-m4a", m4a);
assertAccepted("foo.m4a", "audio/m4a", m4a);
assertAccepted("foo.M4A", "audio/mp4", m4a);
assertAccepted("Инна Процкая диагностика макс.m4a", "audio/mp4", m4a);
assertAccepted("foo.m4a", "", m4a);
assertAccepted("foo.m4a", "application/octet-stream", m4a);

assertRejected("foo.wav", "audio/wav");
assertRejected("foo.mp4", "audio/mp4");
assertRejected("foo.aac", "audio/aac");
assertRejected("foo.mov", "video/quicktime");
assertRejected("foo.ogg", "audio/ogg");
assertRejected("foo.flac", "audio/flac");
assertRejected("foo.m4a", "image/jpeg");
assertRejected("foo.mp3", "audio/mp4");

assert.equal(PERSONAL_MATERIAL_AUDIO_INPUT_ACCEPT, ".mp3,.m4a,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/m4a");

// Author products stay MP3-only
assert.equal(isAllowedMp3File(file("foo.mp3", "audio/mpeg")), true);
assert.equal(isAllowedMp3File(file("diag.m4a", "audio/mp4")), false, "author products reject m4a");
assert.equal(isAllowedMp3File(file("diag.m4a", "audio/x-m4a")), false);
assert.equal(isAllowedMp3File(file("diag.M4A", "audio/mp4")), false);
assert.equal(isAllowedMp3File(file("track.wav", "audio/wav")), false);

const authorProductUpload = read("src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts");
assert(authorProductUpload.includes("isAllowedMp3File"), "author product upload still uses mp3 helper");
assert.equal(authorProductUpload.includes("resolvePersonalMaterialAudioFormat"), false);
assert.equal(authorProductUpload.includes(".m4a"), false);

// Size / empty constraints share the format matrix
assert.equal(getPersonalMaterialAudioFileIssue(file("foo.mp3", "audio/mpeg", 0)), "empty_file");
assert.equal(getPersonalMaterialAudioFileIssue(file("foo.m4a", "audio/mp4", 0)), "empty_file");
assert.equal(
  getPersonalMaterialAudioFileIssue(
    file("foo.m4a", "audio/mp4", PERSONAL_MATERIAL_LIMITS.maxAudioBytes + 1),
  ),
  "file_too_large",
);
assert.equal(getPersonalMaterialAudioFileIssue(file("foo.wav", "audio/wav", 1024)), "invalid_file_type");
assert.equal(getPersonalMaterialAudioFileIssue(file("foo.mp3", "audio/mpeg", 1024)), null);

// Storage path uses validated enum extension, never the user filename
const mp3Path = buildPersonalMaterialAudioPath(AUTHOR_ID, MATERIAL_ID, "mp3");
const m4aPath = buildPersonalMaterialAudioPath(AUTHOR_ID, MATERIAL_ID, "m4a");
assert.match(mp3Path, new RegExp(`^${AUTHOR_ID}/${MATERIAL_ID}/audio/[0-9a-f-]+\\.mp3$`));
assert.match(m4aPath, new RegExp(`^${AUTHOR_ID}/${MATERIAL_ID}/audio/[0-9a-f-]+\\.m4a$`));
assert.doesNotMatch(mp3Path, /Райля|Инна|Процкая|\.\./);
assert.doesNotMatch(m4aPath, /Райля|Инна|Процкая|\.\./);
assert.equal(isPathInsidePersonalMaterialRoot(mp3Path), true);
assert.equal(isPathInsidePersonalMaterialRoot(m4aPath), true);

assert.throws(
  () => buildPersonalMaterialAudioPath(AUTHOR_ID, MATERIAL_ID, "mp4"),
  /invalid_audio_extension/,
);
assert.throws(
  () => buildPersonalMaterialAudioPath(AUTHOR_ID, MATERIAL_ID, "Инна.m4a"),
  /invalid_audio_extension/,
);

assert.equal(
  isPathInsidePersonalMaterialRoot(`${AUTHOR_ID}/${MATERIAL_ID}/audio/${"a".repeat(36)}.mp3`),
  true,
);
assert.equal(
  isPathInsidePersonalMaterialRoot(`${AUTHOR_ID}/${MATERIAL_ID}/../audio/escape.m4a`),
  false,
);
assert.equal(
  isPathInsidePersonalMaterialRoot(`${AUTHOR_ID}/${MATERIAL_ID}/audio/../secrets.mp3`),
  false,
);

const uploads = read("src/lib/personal-materials/server/uploads.ts");
assert(uploads.includes("resolvePersonalMaterialAudioFormat"), "personal upload uses shared resolver");
assert(uploads.includes("probePersonalMaterialAudioDuration"), "personal upload probes real extension");
assert(uploads.includes("format.extension"), "storage path uses validated extension");
assert(uploads.includes("contentType: format.mimeType"), "storage contentType from resolver");
assert(uploads.includes("audio_mime_type: format.mimeType"), "db mime from resolver");
assert.equal(uploads.includes("isAllowedMp3File"), false, "does not widen author-product helper");
assert.equal(uploads.includes("getMp3DurationSeconds"), false, "does not reuse mp3-only probe");
assert.equal(uploads.includes("ffmpeg"), false, "no transcoding");

const uploadFn = uploads.slice(
  uploads.indexOf("export async function uploadPersonalMaterialAudio"),
  uploads.indexOf("export async function deletePersonalMaterialAudio"),
);
const uploadIdx = uploadFn.indexOf(".upload(storagePath, buffer");
const updateIdx = uploadFn.indexOf('.from("personal_materials")');
const updateErrorCleanupIdx = uploadFn.indexOf("if (updateError)");
const replaceIdx = uploadFn.indexOf("resolveReplacedPersonalMaterialStoragePath");
assert.ok(uploadIdx >= 0 && updateIdx > uploadIdx, "upload new object before db update");
assert.ok(updateErrorCleanupIdx > updateIdx, "db failure cleanup after update attempt");
assert.ok(
  uploadFn.includes(".remove([storagePath])"),
  "db failure removes only the new object",
);
assert.ok(replaceIdx > updateErrorCleanupIdx, "old object removed only after successful db update");

const oldMp3 = `${AUTHOR_ID}/${MATERIAL_ID}/audio/11111111-1111-4111-8111-111111111111.mp3`;
const newM4a = `${AUTHOR_ID}/${MATERIAL_ID}/audio/22222222-2222-4222-8222-222222222222.m4a`;
const oldM4a = `${AUTHOR_ID}/${MATERIAL_ID}/audio/33333333-3333-4333-8333-333333333333.m4a`;
const newMp3 = `${AUTHOR_ID}/${MATERIAL_ID}/audio/44444444-4444-4444-8444-444444444444.mp3`;

assert.equal(resolveReplacedPersonalMaterialStoragePath(oldMp3, newM4a), oldMp3);
assert.equal(resolveReplacedPersonalMaterialStoragePath(oldM4a, newMp3), oldM4a);
assert.equal(resolveReplacedPersonalMaterialStoragePath(oldMp3, oldMp3), null);
assert.equal(
  resolveReplacedPersonalMaterialStoragePath(`${AUTHOR_ID}/../escape.mp3`, newM4a),
  null,
);

assert.equal(
  getPersonalMaterialAudioDownloadFallbackFilename(oldMp3),
  "audio.mp3",
);
assert.equal(
  getPersonalMaterialAudioDownloadFallbackFilename(oldM4a),
  "audio.m4a",
);

// Error messages
assert.match(
  getPersonalMaterialUploadErrorMessage("invalid_file_type"),
  /формате MP3 или M4A/i,
);
assert.match(
  getPersonalMaterialUploadErrorMessage("file_too_large"),
  /50 МБ/i,
);
assert.match(getPersonalMaterialUploadErrorMessage("empty_file"), /пуст/i);
assert.match(
  getPersonalMaterialUploadErrorMessage("storage_upload_failed"),
  /Повторите попытку/i,
);
assert.match(
  getPersonalMaterialUploadErrorMessage("internal_error"),
  /ошибки сервера/i,
);
assert.equal(
  getPersonalMaterialUploadErrorMessage("internal_error"),
  PERSONAL_MATERIAL_UPLOAD_SERVER_ERROR_MESSAGE,
);
assert.equal(
  getPersonalMaterialUploadErrorMessage("file_too_large"),
  "Размер файла превышает 50 МБ.",
);
assert.equal(
  getPersonalMaterialUploadErrorMessage("invalid_audio_duration"),
  "Не удалось определить длительность аудиофайла.",
);
assert.equal(
  getPersonalMaterialUploadErrorMessage("empty_file"),
  "Файл пустой. Выберите другой аудиофайл.",
);
assert.equal(
  getPersonalMaterialUploadErrorMessage("storage_upload_failed"),
  "Не удалось загрузить файл. Повторите попытку.",
);

assert.equal(
  PERSONAL_MATERIAL_SUPPORT_MUTATION_BLOCKED_MESSAGE,
  "Сейчас включён режим поддержки другого автора. Выйдите из режима поддержки и повторите действие.",
);
assert.equal(
  getPersonalMaterialUploadErrorMessage("support_mutation_blocked"),
  PERSONAL_MATERIAL_SUPPORT_MUTATION_BLOCKED_MESSAGE,
);
assert.doesNotMatch(
  getPersonalMaterialUploadErrorMessage("support_mutation_blocked"),
  /ошибки сервера/,
);
assert.equal(
  getPersonalMaterialErrorMessage(
    new PersonalMaterialClientError("support_mutation_blocked", 403),
  ),
  PERSONAL_MATERIAL_SUPPORT_MUTATION_BLOCKED_MESSAGE,
);
assert.equal(
  getPersonalMaterialPdfUploadErrorMessage("support_mutation_blocked"),
  PERSONAL_MATERIAL_SUPPORT_MUTATION_BLOCKED_MESSAGE,
);
assert.equal(
  getPersonalMaterialActivationErrorMessage(
    new PersonalMaterialClientError("support_mutation_blocked", 403),
  ),
  PERSONAL_MATERIAL_SUPPORT_MUTATION_BLOCKED_MESSAGE,
);
assert.equal(
  getPersonalMaterialErrorMessage(new PersonalMaterialClientError("internal_error", 500)),
  "Не удалось выполнить действие. Попробуйте ещё раз.",
);

assert.equal(PERSONAL_MATERIAL_LIMITS.maxAudioBytes, 50 * 1024 * 1024);

console.log("stage-p3-personal-materials-upload-unit: PASS");
