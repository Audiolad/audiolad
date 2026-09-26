#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261126130000_music_draft_track_teardown.sql";
const sql = readFileSync(join(repoRoot, "supabase/migrations", migrationName), "utf8");
const smoke = readFileSync(
  join(repoRoot, "supabase/tests/music_draft_track_teardown_smoke.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionBody(source, name) {
  const marker = `FUNCTION public.${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, name);
  const next = source.indexOf("CREATE OR REPLACE FUNCTION", start + marker.length);
  const end = next === -1 ? source.length : next;
  return source.slice(start, end);
}

assert(existsSync(join(repoRoot, "supabase/migrations", migrationName)), "teardown migration exists");
const names = readdirSync(join(repoRoot, "supabase/migrations")).filter((name) => name.endsWith(".sql"));
const versions = names.map((name) => name.match(/^(\d{14})_/)?.[1]).filter(Boolean);
assert(new Set(versions).size === versions.length, "no duplicate migration timestamps");
assert(versions.includes("20261126130000"), "teardown version listed");

const teardown = functionBody(sql, "teardown_music_track_delivery");
const markers = [
  "active_music_delivery_asset_id = NULL",
  "desired_music_master_asset_id = NULL",
  "DELETE FROM public.music_transcode_jobs",
  "asset_role = 'stream'",
  "asset_role = 'master'",
  "DELETE FROM public.audio_items",
];
let cursor = -1;
for (const marker of markers) {
  const index = teardown.indexOf(marker);
  assert(index > cursor, `teardown order missing or out of order: ${marker}`);
  cursor = index;
}
assert(!/\btitle\b/.test(teardown), "teardown must not depend on the track title");
assert(!/duration_seconds\s*<=\s*0/.test(teardown), "missing duration must not block teardown");
assert(/music_upload_generation = music_upload_generation \+ 1/.test(teardown));
assert(/status', 'not_found'/.test(teardown));
assert(/status', 'deleted'/.test(teardown));
assert(/status', 'cleared'/.test(teardown));
assert(/REVOKE ALL ON FUNCTION public\.teardown_music_track_delivery/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.teardown_music_track_delivery/.test(sql));
assert(/TO service_role/.test(sql));
assert(!/DROP TABLE/.test(sql));
assert(!/CREATE POLICY/.test(sql));

const finalize = functionBody(sql, "finalize_music_master_asset");
const staleAt = finalize.indexOf("upload_generation IS DISTINCT FROM v_item.music_upload_generation");
const claimAt = finalize.indexOf("desired_music_master_asset_id = v_asset.id");
assert(staleAt > 0 && claimAt > staleAt, "stale master finalize must return before claiming desired");
assert(/lifecycle_state = 'abandoned'/.test(finalize));

const activate = functionBody(sql, "activate_music_direct_mp3_delivery");
const claimCheck = activate.indexOf("v_claim_generation IS DISTINCT FROM v_item.music_upload_generation");
const writePath = activate.indexOf("audio_path = p_audio_path");
assert(claimCheck > 0 && writePath > claimCheck, "stale MP3 claim must return before writing audio_path");

assert(/naive delete of ready draft track must fail/.test(smoke));
assert(/track without title must delete/.test(smoke));
assert(/uploading draft track must delete/.test(smoke));
assert(/failed upload track must delete/.test(smoke));
assert(/second delete must return not_found/.test(smoke));
assert(/second clear must succeed/.test(smoke));
assert(/old upload completion must not corrupt the newer master/.test(smoke));
assert(/replace twice must keep the latest master/.test(smoke));
assert(/old MP3 completion must not apply/.test(smoke));
assert(/deleting one track must keep the rest of the project/.test(smoke));
assert(/ROLLBACK;/.test(smoke));

process.stdout.write("music-draft-track-delete-sql-unit: ok\n");
