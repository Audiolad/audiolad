#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  getGuestReturnButtonLabel,
  shouldShowGuestReturnChatButton,
  validateReturnButtonLabel,
  validateReturnUrl,
} from "../src/lib/personal-materials/return-url.ts";
import { toSafeAuthorPersonalMaterialDto, toSafeGuestPersonalMaterialDto } from "../src/lib/personal-materials/server/dto.ts";

const baseRow = {
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
  return_url: "https://example.com/chat",
  return_button_label: "Вернуться в чат с Сергеем Петровым",
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

const authorDto = toSafeAuthorPersonalMaterialDto(baseRow);
assert.equal(authorDto.returnUrl, "https://example.com/chat");
assert.equal(authorDto.returnButtonLabel, "Вернуться в чат с Сергеем Петровым");
assert.equal("access_token_hash" in authorDto, false);
assert.equal("audio_path" in authorDto, false);

const guestDto = toSafeGuestPersonalMaterialDto({
  material: baseRow,
  author: { id: baseRow.author_id, name: "Author", slug: "author", avatar_url: null },
});
assert.equal(guestDto.returnUrl, "https://example.com/chat");
assert.equal(guestDto.returnButtonLabel, "Вернуться в чат с Сергеем Петровым");

assert.equal(validateReturnUrl("").normalized, null);
assert.equal(validateReturnUrl("https://chat.example/room").valid, true);
assert.equal(validateReturnUrl("javascript:alert(1)").valid, false);
assert.equal(validateReturnUrl("data:text/html,x").valid, false);
assert.equal(validateReturnUrl("http://localhost:3000/chat").valid, true);
assert.equal(validateReturnUrl("x".repeat(2001)).valid, false);
assert.equal(validateReturnButtonLabel("x".repeat(121)).valid, false);

assert.equal(shouldShowGuestReturnChatButton({ returnUrl: null }), false);
assert.equal(shouldShowGuestReturnChatButton({ returnUrl: "https://example.com" }), true);
assert.equal(
  getGuestReturnButtonLabel({ returnButtonLabel: null }),
  "Вернуться в чат с автором",
);

console.log("stage-p3-personal-materials-return-url-module-unit: PASS");
