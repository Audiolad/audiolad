#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261007140000_music_transcode_worker.sql";
const foundationName = "20261007120000_music_wav_master_foundation.sql";
const sql = readFileSync(join(repoRoot, "supabase/migrations", migrationName), "utf8");
const foundation = readFileSync(join(repoRoot, "supabase/migrations", foundationName), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(join(repoRoot, "supabase/migrations", migrationName)), "slice 2 migration exists");
assert(!existsSync(join(repoRoot, "supabase/migrations", "20261007120200_topics_functional_scenarios.sql")), "unused topics restamp stays gone");

const names = readdirSync(join(repoRoot, "supabase/migrations")).filter((name) => name.endsWith(".sql"));
const versions = names.map((name) => name.match(/^(\d{14})_/)?.[1]).filter(Boolean);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20261007140000"), "new version listed");
assert(versions.includes("20261007130000"), "topics version remains");

assert(/output_asset_id uuid NULL/.test(sql));
assert(/ON DELETE SET NULL/.test(sql));
assert(/music_transcode_jobs_ready_output_check/.test(sql));
assert(/asset_role = 'stream'/.test(sql));
assert(/lifecycle_state = 'verified'/.test(sql));
assert(/source_asset_id = NEW\.source_asset_id/.test(sql));
assert(/recover_stale_music_transcode_jobs/.test(sql));
assert(/claim_music_transcode_job/.test(sql));
assert(/FOR UPDATE SKIP LOCKED/.test(sql));
assert(/renew_music_transcode_job_lease/.test(sql));
assert(/complete_music_transcode_job/.test(sql));
assert(/fail_music_transcode_job/.test(sql));
assert(/release_music_transcode_job/.test(sql));
assert(!/lease_expires_at\s*(?:=|>|<|>=|<=)\s*now\s*\(/.test(sql), "lease ownership must not use transaction-stable now()");
assert(!/lease_expires_at\s*=\s*now\s*\(\s*\)\s*\+/.test(sql), "claim/renew expiry must not be now() + interval");
assert((sql.match(/clock_timestamp\s*\(/g) || []).length >= 9, "lease-critical RPCs must use clock_timestamp()");
assert(/lease_expires_at = clock_timestamp\(\) \+ make_interval/.test(sql), "claim/renew set wall-clock expiry");
assert(/lease_expires_at <= clock_timestamp\(\)/.test(sql), "complete/fail/recover compare wall-clock expiry");
assert((sql.match(/lease_expires_at > clock_timestamp\(\)/g) || []).length >= 4, "renew/complete/fail/release UPDATE guards use clock_timestamp");
assert(/lease_expires_at IS NOT NULL/.test(sql));
assert(/REVOKE ALL ON FUNCTION public\.claim_music_transcode_job/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.claim_music_transcode_job/.test(sql));
assert(/TO service_role/.test(sql));
assert(/FROM PUBLIC, anon, authenticated/.test(sql));
assert(!/active_music_delivery_asset_id/.test(sql));
assert(!/DROP TABLE/.test(sql));
assert(!/TRUNCATE/.test(sql));
assert(foundation.includes("CREATE TABLE public.music_transcode_jobs"));

console.log("music-transcode-sql-unit: ok");
