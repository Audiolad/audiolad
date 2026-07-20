#!/usr/bin/env node
/**
 * Module-level unit checks imported via tsx.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { resolveGuestAccessState } from "../src/lib/personal-materials/access.ts";
import { toSafeAuthorPersonalMaterialDto, toSafeGuestPersonalMaterialDto } from "../src/lib/personal-materials/server/dto.ts";
import {
  buildPersonalMaterialAccessUrl,
  redactTokenFromPath,
} from "../src/lib/personal-materials/server/delivery.ts";
import { parseCreatePersonalMaterialBody, parseUpdatePersonalMaterialBody } from "../src/lib/personal-materials/server/validation.ts";
import { mapPersonalMaterialRpcError } from "../src/lib/personal-materials/server/errors.ts";
import { PERSONAL_MATERIAL_LIMITS } from "../src/lib/personal-materials/types.ts";

const baseMaterial = {
  id: "00000000-0000-4000-8000-000000000001",
  author_id: "00000000-0000-4000-8000-000000000002",
  created_by: "00000000-0000-4000-8000-000000000003",
  material_type: "diagnostic",
  title: null,
  client_first_name: "Anna",
  client_last_name: "Secret",
  material_date: "2026-07-15",
  description: "Desc",
  personal_recommendation: null,
  audio_path: "author/material/audio/sample.mp3",
  audio_original_filename: "sample.mp3",
  audio_mime_type: "audio/mpeg",
  audio_size_bytes: 1000,
  duration_seconds: 120,
  pdf_path: null,
  pdf_original_filename: null,
  pdf_mime_type: null,
  pdf_size_bytes: null,
  status: "active",
  access_token_hash: "\\x" + "a".repeat(64),
  guest_access_enabled: true,
  token_created_at: null,
  expires_at: null,
  claimed_by_user_id: null,
  claimed_at: null,
  first_opened_at: null,
  first_audio_started_at: null,
  revoked_at: null,
  deleted_at: null,
  created_at: "2026-07-15T10:00:00.000Z",
  updated_at: "2026-07-15T10:00:00.000Z",
};

const authorDto = toSafeAuthorPersonalMaterialDto(baseMaterial);
assert.equal(authorDto.hasAudio, true);
assert.equal(authorDto.clientLastName, "Secret");
assert.equal("access_token_hash" in authorDto, false);
assert.equal("audio_path" in authorDto, false);

const guestDto = toSafeGuestPersonalMaterialDto({
  material: baseMaterial,
  author: {
    id: baseMaterial.author_id,
    name: "Author",
    slug: "author",
    avatar_url: null,
  },
});
assert.equal(guestDto.clientFirstName, "Anna");
assert.equal("clientLastName" in guestDto, false);
assert.equal(guestDto.hasAudio, true);

assert.equal(resolveGuestAccessState(baseMaterial), "available");
assert.equal(
  resolveGuestAccessState({ ...baseMaterial, status: "revoked", revoked_at: "2026-07-15T11:00:00.000Z" }),
  "revoked",
);
assert.equal(
  resolveGuestAccessState({ ...baseMaterial, claimed_by_user_id: "00000000-0000-4000-8000-000000000099" }),
  "claimed",
);
assert.equal(
  resolveGuestAccessState({
    ...baseMaterial,
    expires_at: "2020-01-01T00:00:00.000Z",
  }),
  "expired",
);

const createBody = parseCreatePersonalMaterialBody({
  authorId: baseMaterial.author_id,
  materialType: "diagnostic",
  clientFirstName: "Anna",
  clientLastName: "Ivanova",
  materialDate: "2026-07-15",
});
assert.equal(createBody.clientFirstName, "Anna");

assert.throws(
  () =>
    parseCreatePersonalMaterialBody({
      authorId: baseMaterial.author_id,
      materialType: "diagnostic",
      clientFirstName: "Bad<script>",
      clientLastName: "Ivanova",
      materialDate: "2026-07-15",
    }),
  /invalid_request/,
);

const updateBody = parseUpdatePersonalMaterialBody({ title: "New title" });
assert.equal(updateBody.title, "New title");
assert.equal(updateBody.clientFirstName, undefined);

assert.equal(mapPersonalMaterialRpcError("material_not_editable").status, 409);
assert.equal(mapPersonalMaterialRpcError("material_not_ready").status, 422);

const token = "a".repeat(43);
const redacted = redactTokenFromPath(`/api/d/${token}/audio`);
assert.match(redacted, /\[redacted:[0-9a-f]{12}\]/);
assert.doesNotMatch(redacted, new RegExp(token));

const accessUrl = buildPersonalMaterialAccessUrl("test-token-value");
assert.match(accessUrl, /\/d\//);

assert.equal(PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds, 900);

console.log("stage-p2-personal-materials-api-module-unit: PASS");
