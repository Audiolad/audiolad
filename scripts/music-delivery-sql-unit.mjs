#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261007150000_music_delivery_promotion.sql";
const sql = readFileSync(join(repoRoot, "supabase/migrations", migrationName), "utf8");
const smoke = readFileSync(join(repoRoot, "supabase/tests/music_delivery_promotion_smoke.sql"), "utf8");
const previous = readFileSync(
  join(repoRoot, "supabase/migrations/20261007140000_music_transcode_worker.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(join(repoRoot, "supabase/migrations", migrationName)), "slice 3 migration exists");
assert(existsSync(join(repoRoot, "supabase/tests/music_delivery_promotion_smoke.sql")), "slice 3 smoke exists");

const names = readdirSync(join(repoRoot, "supabase/migrations")).filter((name) => name.endsWith(".sql"));
const versions = names.map((name) => name.match(/^(\d{14})_/)?.[1]).filter(Boolean);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20261007150000"), "new version listed");
assert(versions.includes("20261007140000"), "slice 2 version remains");
assert(!names.includes("20261007120000_music_wav_master_foundation.sql") === false, "slice 1 remains");

assert(/desired_music_master_asset_id/.test(sql));
assert(/guard_desired_music_master_asset/.test(sql));
assert(/asset_role = 'master'/.test(sql));
assert(/promote_music_item_delivery/.test(sql));
assert(/storage_bucket = 'music-streams'/.test(sql));
assert(/source_asset_id = item\.desired_music_master_asset_id/.test(sql));
assert(/guard_music_delivery_pointer_roles/.test(sql));
assert(/music_delivery_pointer_forbidden/.test(sql));
assert(/SET desired_music_master_asset_id = v_asset\.id/.test(sql));
assert(/PERFORM public\.promote_music_item_delivery/.test(sql));
assert(/REVOKE ALL ON FUNCTION public\.promote_music_item_delivery/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.promote_music_item_delivery/.test(sql));
assert(/TO service_role/.test(sql));
assert(/FROM PUBLIC, anon, authenticated/.test(sql));
assert(!/DROP TABLE/.test(sql));
assert(!/CREATE POLICY/.test(sql));
assert(!/active_music_delivery_asset_id/.test(previous), "slice 2 still does not promote");

assert(/A current verified stream must promote/.test(smoke));
assert(/B unverified stream must not promote/.test(smoke));
assert(/C other audio_item stream must not promote/.test(smoke));
assert(/D other source stream must not promote/.test(smoke));
assert(/E stale source A must not overwrite desired B/.test(smoke));
assert(/F failed replacement must keep old active/.test(smoke));
assert(/G current B stream must promote/.test(smoke));
assert(/H authenticated must not update delivery pointer/.test(smoke));
assert(/I service_role promote of current stream must remain true/.test(smoke));


assert(/activate_music_direct_mp3_delivery/.test(sql));
assert(/desired_music_master_asset_id = NULL/.test(sql));
assert(/active_music_delivery_asset_id = NULL/.test(sql));
assert(/Only the real uploading/.test(sql) || /lifecycle_state = 'uploading'/.test(sql));
assert(/Idempotent verified retry/.test(sql) || /RETURN v_asset;\s*END;/.test(sql));
assert(/REVOKE ALL ON FUNCTION public\.activate_music_direct_mp3_delivery/.test(sql));
assert(/J direct MP3 activation must succeed/.test(smoke));
assert(/K stale stream A must not promote after MP3 current/.test(smoke));
assert(/L stale complete must not change current MP3 delivery/.test(smoke));
assert(/M verified retry must not grow job count/.test(smoke));
assert(/N delayed finalize\(C\) must not steal desired from D/.test(smoke));


assert(/audio_item_has_existing_music_current_audio/.test(sql));
assert(/PRODUCT_CONTENT_LOCKED_AFTER_SALE/.test(sql));
assert(/practice_is_content_locked_after_sale/.test(sql));
assert(/audio_item_has_delivered_music_audio/.test(sql));
assert(/A user_practices must lock practice/.test(smoke));
assert(/B studio entitlement must lock practice/.test(smoke));
assert(/C paid order must lock practice/.test(smoke));
assert(/D revoked studio entitlement alone must not lock/.test(smoke));
assert(/E activate must raise under paid lock/.test(smoke));
assert(/F finalize must raise under paid lock/.test(smoke));
assert(/H first-ever MP3 under lock must succeed/.test(smoke));
assert(/I locked promote must not replace delivered stream A/.test(smoke));
assert(/J blocked promote should clear stale desired/.test(smoke));

process.stdout.write("music-delivery-sql-unit: ok\n");
