#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260805120000_practice_product_kind_audio_post.sql",
  ),
  "utf8",
);

assert.match(migration, /DROP CONSTRAINT IF EXISTS practices_product_kind_check/);
assert.match(migration, /'practice', 'music', 'audio_post'/);
assert.match(migration, /DROP CONSTRAINT IF EXISTS practices_music_usage_permission_check/);
assert.match(migration, /product_kind IN \('practice', 'audio_post'\)/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS promo_enabled boolean NOT NULL DEFAULT false/);
assert.match(migration, /audio_post_requires_single_audio/);
assert.match(migration, /audio_post_must_be_free/);
assert.match(migration, /promo_title_required/);
assert.match(migration, /promo_text_required/);
assert.match(migration, /promo_button_text_required/);
assert.match(migration, /promo_url_required/);
assert.match(migration, /product_kind IN \('practice', 'music'\)/);
assert.match(migration, /WHEN v_product_kind = 'audio_post' THEN 'аудиопост'/);

const optionalDescriptionMigration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260805193000_audio_post_optional_description.sql",
  ),
  "utf8",
);
assert.match(
  optionalDescriptionMigration,
  /CREATE OR REPLACE FUNCTION public\.assert_practice_moderation_ready/,
);
assert.match(
  optionalDescriptionMigration,
  /product_kind <> 'audio_post'[\s\S]*missing_description/,
);
assert.match(
  optionalDescriptionMigration,
  /internal-moderation-readiness:v3/,
);

console.log("audio-post-migration-sql-unit: ok");
