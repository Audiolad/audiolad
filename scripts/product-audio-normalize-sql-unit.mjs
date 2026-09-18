#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mimeName = "20261009120000_practice_audio_allow_m4a_aac_mime.sql";
const jobsName = "20261009120100_product_audio_normalize_jobs.sql";
const wavName = "20261009120400_practice_audio_allow_wav_normalize.sql";
const mime = readFileSync(join(repoRoot, "supabase/migrations", mimeName), "utf8");
const sql = readFileSync(join(repoRoot, "supabase/migrations", jobsName), "utf8");
const wav = readFileSync(join(repoRoot, "supabase/migrations", wavName), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(join(repoRoot, "supabase/migrations", mimeName)));
assert(existsSync(join(repoRoot, "supabase/migrations", jobsName)));

const names = readdirSync(join(repoRoot, "supabase/migrations")).filter((n) => n.endsWith(".sql"));
const versions = names.map((n) => n.match(/^(\d{14})_/)?.[1]).filter(Boolean);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20261009120000"));
assert(versions.includes("20261009120100"));

assert(/array_append\(allowed_mime_types, 'audio\/mp4'\)/.test(mime));
assert(/array_append\(allowed_mime_types, 'audio\/x-m4a'\)/.test(mime));
assert(/array_append\(allowed_mime_types, 'audio\/m4a'\)/.test(mime));
assert(/array_append\(allowed_mime_types, 'audio\/aac'\)/.test(mime));
assert(/array_append\(allowed_mime_types, 'audio\/x-aac'\)/.test(mime));
assert(!/allowed_mime_types\s*=\s*ARRAY\[/.test(mime), "must not overwrite MIME array");
assert(!/array_append\(allowed_mime_types, 'application\/octet-stream'\)/.test(mime), "octet-stream not added without need");
assert(!/SET\s+file_size_limit/.test(mime) && !/file_size_limit\s*=/.test(mime), "must not change file_size_limit");
assert(!/\bpublic\s*=/.test(mime), "must not change public flag");

assert(/CREATE TABLE public\.product_audio_normalize_jobs/.test(sql));
assert(/desired_product_audio_normalize_job_id/.test(sql));
assert(/status IN \('queued', 'processing', 'ready', 'failed', 'superseded'\)/.test(sql));
assert(/enqueue_product_audio_normalize_job/.test(sql));
assert(/claim_product_audio_normalize_job/.test(sql));
assert(/FOR UPDATE SKIP LOCKED/.test(sql));
assert(/complete_product_audio_normalize_job/.test(sql));
assert(/desired_product_audio_normalize_job_id IS DISTINCT FROM v_job\.id/.test(sql));
assert(/fail_product_audio_normalize_job/.test(sql));
assert(/recover_stale_product_audio_normalize_jobs/.test(sql));
assert(/clock_timestamp\s*\(/.test(sql));
assert(!/lease_expires_at\s*(?:=|>|<|>=|<=)\s*now\s*\(/.test(sql));
assert(/REVOKE ALL ON FUNCTION public\.claim_product_audio_normalize_job/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.claim_product_audio_normalize_job/.test(sql));
assert(/TO service_role/.test(sql));
assert(/FROM PUBLIC, anon, authenticated/.test(sql));
assert(/ENABLE ROW LEVEL SECURITY/.test(sql));
assert(!/CREATE POLICY/.test(sql), "no browser policies on normalize jobs");
assert(!/REFERENCES public\.music_transcode_jobs/.test(sql));
assert(!/REFERENCES public\.music_audio_assets/.test(sql));
assert(!/FROM public\.music_transcode_jobs/.test(sql));
assert(!/FROM public\.music_audio_assets/.test(sql));


assert(/cleanup_source boolean/.test(sql), "fail RPC returns cleanup_source");
assert(/resolve_product_audio_normalize_job_interrupt/.test(sql));
assert(/guard_product_audio_normalize_pointer_roles/.test(sql));
assert(/product_audio_normalize_pointer_forbidden/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.resolve_product_audio_normalize_job_interrupt/.test(sql));


assert(/outcome text/.test(sql), "complete returns outcome");
assert(/cleanup_previous boolean/.test(sql), "complete returns cleanup_previous");
assert(/Canonical lock order: audio_item/.test(sql));
assert(/already_ready/.test(sql));
assert(/foreign_lease/.test(sql));
assert(/expired_requeued/.test(sql));
assert(/DROP FUNCTION IF EXISTS public\.complete_product_audio_normalize_job/.test(sql));


// enqueue already locks audio_item before mutating jobs (canonical order).
assert(/SELECT \* INTO v_item[\s\S]*FOR UPDATE;[\s\S]*UPDATE public\.product_audio_normalize_jobs/.test(sql));
assert(/FROM public\.audio_items[\s\S]*FOR UPDATE;[\s\S]*FROM public\.product_audio_normalize_jobs[\s\S]*FOR UPDATE/.test(sql));


assert(/'expired_requeued'::text, 'queued'::text, false, false, false/.test(sql), "expired_requeued must not cleanup shared target");
assert(/'queued'::text, 'queued'::text, false, false, false/.test(sql), "retry queued must not cleanup shared target");
assert(/'released'::text, 'queued'::text, false, false, false/.test(sql), "released must not cleanup shared target");
assert(!/'expired_requeued'::text, 'queued'::text, false, true, false/.test(sql), "no expired_requeued target cleanup");
assert(!/'released'::text, 'queued'::text, false, true, false/.test(sql), "no released target cleanup");
assert(/'failed'::text, 'failed'::text, true, true, false/.test(sql), "terminal failed still cleans source+target");
assert(/'superseded'::text, 'superseded'::text, true, true, false/.test(sql), "superseded still cleans source+target");
assert(/SET audio_path = p_target_storage_path/.test(sql), "applied complete points audio_path at this attempt MP3");
assert(/Retry\/requeue: job is claimable again/.test(sql));

console.log("product-audio-normalize-sql-unit: ok");

assert(existsSync(join(repoRoot, "supabase/migrations", wavName)));
assert(versions.includes("20261009120400"));
assert(/array_append\(allowed_mime_types, 'audio\/wav'\)/.test(wav));
assert(/array_append\(allowed_mime_types, 'audio\/x-wav'\)/.test(wav));
assert(/array_append\(allowed_mime_types, 'audio\/wave'\)/.test(wav));
assert(/array_append\(allowed_mime_types, 'audio\/vnd.wave'\)/.test(wav));
assert(!/allowed_mime_types\s*=\s*ARRAY\[/.test(wav), "must not overwrite MIME array");
assert(!/SET\s+file_size_limit/.test(wav) && !/file_size_limit\s*=/.test(wav));
assert(!/\bpublic\s*=/.test(wav), "must not change public flag");
assert(/source_format IN \('m4a', 'aac', 'wav'\)/.test(wav));
assert(/\(m4a\|aac\|wav\)/.test(wav));
assert(/p_source_format NOT IN \('m4a', 'aac', 'wav'\)/.test(wav));
assert(!/20261009120000/.test(wav.split("\n")[0]));

assert(/DROP FUNCTION IF EXISTS public\.enqueue_product_audio_normalize_job/.test(wav), "enqueue return type change needs DROP");
assert(/RETURNS jsonb/.test(wav), "enqueue returns jsonb with cleanup plan");
assert(/cleanup_source_paths/.test(wav));
assert(/cleanup_target_paths/.test(wav));
assert(/activate_product_direct_mp3_delivery/.test(wav));
assert(/REVOKE ALL ON FUNCTION public\.activate_product_direct_mp3_delivery/.test(wav));
assert(/GRANT EXECUTE ON FUNCTION public\.activate_product_direct_mp3_delivery/.test(wav));
assert(/FROM PUBLIC, anon, authenticated/.test(wav));
assert(/TO service_role/.test(wav));
assert(/Canonical lock order: audio_item/.test(wav));
assert(/v_old\.status = 'queued'/.test(wav), "only queued superseded jobs contribute cleanup");
assert(/processing/.test(wav));
assert(/desired_product_audio_normalize_job_id = NULL/.test(wav));
assert(!/activate_music_direct_mp3_delivery/.test(wav), "music activate stays on music migration");
console.log("product-audio-normalize-sql-unit: wav race hardening ok");
