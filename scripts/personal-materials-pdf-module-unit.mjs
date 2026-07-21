#!/usr/bin/env node
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import {
  hasPdfMagicBytes,
  isAllowedPdfMimeType,
  validatePdfUpload,
} from "../src/lib/personal-materials/server/pdf-validation.ts";
import { toSafeGuestPersonalMaterialDto } from "../src/lib/personal-materials/server/dto.ts";
import { buildPersonalMaterialGuestApiPaths } from "../src/lib/personal-materials/guest/api-paths.ts";
import { PERSONAL_MATERIAL_LIMITS } from "../src/lib/personal-materials/types.ts";

const fakePdf = new File([Buffer.from("%PDF-1.4 test")], "doc.pdf", {
  type: "application/pdf",
});
const fakeImage = new File([Buffer.from("89504e470d0a1a0a")], "image.pdf", {
  type: "application/pdf",
});
const oversized = new File(
  [Buffer.alloc(PERSONAL_MATERIAL_LIMITS.maxPdfBytes + 1, 0x25)],
  "big.pdf",
  { type: "application/pdf" },
);

assert.equal(isAllowedPdfMimeType("application/pdf"), true);
assert.equal(isAllowedPdfMimeType("image/png"), false);
assert.equal(hasPdfMagicBytes(Buffer.from("%PDF-1.4")), true);
assert.equal(hasPdfMagicBytes(Buffer.from("hello")), false);

assert.deepEqual(
  validatePdfUpload({
    file: fakePdf,
    buffer: Buffer.from("%PDF-1.4 test"),
  }),
  { ok: true },
);

assert.equal(
  validatePdfUpload({
    file: fakeImage,
    buffer: Buffer.from("89504e470d0a1a0a"),
  }).code,
  "invalid_file_type",
);

assert.equal(
  validatePdfUpload({
    file: oversized,
    buffer: Buffer.alloc(PERSONAL_MATERIAL_LIMITS.maxPdfBytes + 1),
  }).code,
  "invalid_file_size",
);

const guestDto = toSafeGuestPersonalMaterialDto({
  material: {
    id: "00000000-0000-4000-8000-000000000001",
    author_id: "00000000-0000-4000-8000-000000000002",
    created_by: "00000000-0000-4000-8000-000000000003",
    material_type: "diagnostic",
    title: null,
    client_first_name: "Anna",
    client_last_name: "Secret",
    material_date: "2026-07-15",
    description: null,
    personal_recommendation: null,
    return_url: null,
    return_button_label: null,
    audio_path: null,
    audio_original_filename: null,
    audio_mime_type: null,
    audio_size_bytes: null,
    duration_seconds: null,
    pdf_path: "author/material/documents/file.pdf",
    pdf_original_filename: "file.pdf",
    pdf_mime_type: "application/pdf",
    pdf_size_bytes: 1000,
    status: "active",
    access_token_hash: null,
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
  },
  author: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Author",
    slug: "author",
    avatar_url: null,
  },
});

assert.equal(guestDto.hasAudio, false);
assert.equal(guestDto.hasPdf, true);

const paths = buildPersonalMaterialGuestApiPaths(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
assert.ok(paths?.pdf.endsWith("/pdf"));
assert.ok(paths?.pdfOpen.endsWith("/pdf/open"));

console.log("personal-materials-pdf-module-unit: PASS");
