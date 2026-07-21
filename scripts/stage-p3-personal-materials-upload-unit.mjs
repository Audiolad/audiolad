#!/usr/bin/env node
/**
 * Upload and optional last-name unit checks for personal materials hotfix.
 */
import assert from "node:assert/strict";

import { isAllowedMp3File } from "../src/lib/author-products/media.ts";
import { formatClientDisplayName } from "../src/lib/personal-materials/display-name.ts";
import {
  buildPersonalMaterialAudioPath,
  isPathInsidePersonalMaterialRoot,
} from "../src/lib/personal-materials/storage.ts";
import {
  getPersonalMaterialUploadErrorMessage,
} from "../src/lib/personal-materials/client/errors.ts";
import {
  isAllowedClientMp3File,
  validatePersonalMaterialForm,
} from "../src/lib/personal-materials/client/validation.ts";
import {
  parseCreatePersonalMaterialBody,
  parseUpdatePersonalMaterialBody,
} from "../src/lib/personal-materials/server/validation.ts";
import { PERSONAL_MATERIAL_LIMITS } from "../src/lib/personal-materials/types.ts";

const AUTHOR_ID = "00000000-0000-4000-8000-000000000002";
const MATERIAL_ID = "00000000-0000-4000-8000-000000000001";

function file(name, type, size = 1024) {
  return { name, type, size };
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

// MP3 MIME acceptance
for (const type of ["audio/mpeg", "audio/mp3", "application/octet-stream", ""]) {
  assert.equal(isAllowedMp3File(file("Райля.mp3", type)), true, `server mime: ${type || "empty"}`);
  assert.equal(
    isAllowedClientMp3File(file("Райля.mp3", type)),
    true,
    `client mime: ${type || "empty"}`,
  );
}

assert.equal(isAllowedMp3File(file("track.wav", "audio/wav")), false);
assert.equal(isAllowedClientMp3File(file("track.wav", "audio/wav")), false);

// Storage path uses server-generated safe key
const storagePath = buildPersonalMaterialAudioPath(AUTHOR_ID, MATERIAL_ID);
assert.match(storagePath, new RegExp(`^${AUTHOR_ID}/${MATERIAL_ID}/audio/[0-9a-f-]+\\.mp3$`));
assert.doesNotMatch(storagePath, /Райля/);
assert.equal(isPathInsidePersonalMaterialRoot(storagePath), true);

// Error messages
assert.match(
  getPersonalMaterialUploadErrorMessage("invalid_file_type"),
  /формате MP3/i,
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

assert.equal(PERSONAL_MATERIAL_LIMITS.maxAudioBytes, 50 * 1024 * 1024);

console.log("stage-p3-personal-materials-upload-unit: PASS");
