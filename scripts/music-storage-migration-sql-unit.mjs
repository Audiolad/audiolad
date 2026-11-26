import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20270411120000_music_master_storage_providers.sql", import.meta.url),
  "utf8",
);

assert.match(sql, /storage_provider text NOT NULL DEFAULT 'supabase_file'/);
assert.match(sql, /content_sha256 text NULL/);
assert.match(sql, /storage_provider IN \('supabase_file', 'timeweb_s3'\)/);
assert.match(sql, /music_storage_copies/);
assert.match(sql, /music_storage_cleanup_jobs/);
assert.match(sql, /UNIQUE \(asset_id, target_provider, storage_bucket, storage_path\)/);
assert.match(sql, /music_storage_daily_metrics/);
assert.match(sql, /record_music_storage_metric/);
assert.match(sql, /music_master_provider_switch_unverified/);
assert.match(sql, /music_master_checksum_immutable/);
assert.match(sql, /REVOKE ALL ON TABLE public\.music_storage_copies FROM PUBLIC, anon, authenticated/);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+public\.music_audio_assets\b/i);
assert.doesNotMatch(sql, /\bUPDATE\s+public\.music_audio_assets\b/i);
assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);

console.log("music storage migration SQL unit: ok");
