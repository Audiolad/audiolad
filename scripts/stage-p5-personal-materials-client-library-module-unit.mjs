#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  getClientLibraryStatusLabel,
  getMyMaterialDisplayTitle,
  getProgressLabel,
  getProgressPercent,
  isProgressCompleted,
  resolveClientLibraryUiStatus,
} from "../src/lib/personal-materials/client-library/display.ts";
import {
  mergeGuestAndServerProgress,
  toMyPersonalMaterialDetailDto,
  toMyPersonalMaterialListItemDto,
} from "../src/lib/personal-materials/client-library/mappers.ts";

assert.equal(
  getMyMaterialDisplayTitle(null, "diagnostic"),
  "Аудиодиагностика по фото",
);

assert.equal(
  resolveClientLibraryUiStatus({
    availability: "available",
    completed: false,
    hasAudio: true,
  }),
  "available",
);
assert.equal(
  resolveClientLibraryUiStatus({
    availability: "available",
    completed: true,
    hasAudio: true,
  }),
  "completed",
);
assert.equal(getClientLibraryStatusLabel("unavailable"), "Недоступен");

assert.equal(
  getProgressLabel({ positionSeconds: 0, durationSeconds: 100, completed: false }),
  "Не начато",
);
assert.equal(
  getProgressLabel({ positionSeconds: 42, durationSeconds: 100, completed: false }),
  "Прослушано 42%",
);
assert.equal(getProgressPercent({ positionSeconds: 50, durationSeconds: null, completed: false }), null);

assert.equal(isProgressCompleted({ positionSeconds: 96, durationSeconds: 100 }), true);
assert.equal(isProgressCompleted({ positionSeconds: 10, durationSeconds: 100 }), false);

const list = toMyPersonalMaterialListItemDto({
  id: "00000000-0000-4000-8000-000000000001",
  author_id: "00000000-0000-4000-8000-000000000002",
  author_name: "Author",
  author_slug: "author",
  author_avatar_url: null,
  material_type: "diagnostic",
  title: null,
  material_date: "2026-07-20",
  duration_seconds: 120,
  has_audio: true,
  status: "revoked",
  claimed_at: "2026-07-20T10:00:00.000Z",
  progress: { position_seconds: 30, completed: false, updated_at: "2026-07-20T11:00:00.000Z" },
});

assert.equal(list.availability, "available");
assert.equal("access_token_hash" in list, false);
assert.equal("audio_path" in list, false);
assert.equal("url" in list, false);

const detail = toMyPersonalMaterialDetailDto({
  ...list,
  id: list.id,
  author_id: list.author.id,
  author_name: list.author.name,
  author_slug: list.author.slug,
  material_type: list.materialType,
  material_date: list.diagnosticDate,
  duration_seconds: 120,
  has_audio: true,
  claimed_at: list.claimedAt,
  description: "Hello <b>world</b>",
  personal_recommendation: "Rec",
  return_url: "https://example.com/chat",
  return_button_label: "Вернуться",
  progress: { position_seconds: 30, completed: false, updated_at: null },
});

assert.equal(detail.returnUrl, "https://example.com/chat");
assert.equal(detail.description?.includes("<b>"), true);

const merged = mergeGuestAndServerProgress({
  server: {
    positionSeconds: 10,
    durationSeconds: 100,
    completed: false,
    updatedAt: "2026-07-20T10:00:00.000Z",
  },
  guest: {
    positionSeconds: 40,
    durationSeconds: 100,
    updatedAt: "2026-07-20T12:00:00.000Z",
  },
});
assert.equal(merged.positionSeconds, 40);

console.log("stage-p5-personal-materials-client-library-module-unit: PASS");
