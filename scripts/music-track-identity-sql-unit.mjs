#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appliedName = "20261129120000_music_track_identity.sql";
const fixName = "20261203120000_music_track_identity_definer.sql";
const applied = readFileSync(join(repoRoot, "supabase/migrations", appliedName), "utf8");
const fix = readFileSync(join(repoRoot, "supabase/migrations", fixName), "utf8");
const smoke = readFileSync(
  join(repoRoot, "supabase/tests/music_track_identity_privilege_smoke.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionHeader(source, name) {
  const marker = `FUNCTION public.${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `missing ${name}`);
  const asMarker = source.indexOf("AS $$", start);
  assert(asMarker > start, `missing body ${name}`);
  return source.slice(start, asMarker);
}

const names = readdirSync(join(repoRoot, "supabase/migrations")).filter((name) =>
  name.endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{14})_/)?.[1]).filter(Boolean);
assert(new Set(versions).size === versions.length, "duplicate migration timestamps");
assert(versions.includes("20261129120000"), "applied identity migration stays listed");
assert(versions.includes("20261203120000"), "definer migration listed");
assert(
  versions.filter((version) => version > "20261202120000").includes("20261203120000"),
  "definer migration is stamped after the latest main migration",
);

for (const name of ["ensure_music_track_identity", "backfill_music_track_identity_on_kind_change"]) {
  const appliedHeader = functionHeader(applied, name);
  assert(!/SECURITY DEFINER/.test(appliedHeader), `${name} in the applied migration stays INVOKER`);
  const fixHeader = functionHeader(fix, name);
  assert(/SECURITY DEFINER/.test(fixHeader), `${name} becomes SECURITY DEFINER`);
  assert(/SET search_path = public, pg_temp/.test(fixHeader), `${name} pins search_path`);
}

assert(/REVOKE ALL ON FUNCTION public\.next_music_track_code\(\) FROM PUBLIC, anon, authenticated;/.test(applied));
assert(/GRANT EXECUTE ON FUNCTION public\.next_music_track_code\(\) TO service_role;/.test(applied));
assert(!/SECURITY DEFINER/.test(functionHeader(applied, "next_music_track_code")));
assert(!/CREATE OR REPLACE FUNCTION public\.next_music_track_code/.test(fix));
assert(/REVOKE ALL ON FUNCTION public\.next_music_track_code\(\) FROM PUBLIC, anon, authenticated;/.test(fix));
assert(/GRANT EXECUTE ON FUNCTION public\.next_music_track_code\(\) TO service_role;/.test(fix));
assert(!/GRANT EXECUTE ON FUNCTION public\.next_music_track_code\(\) TO (authenticated|anon|PUBLIC)/.test(fix));
assert(/Do not GRANT EXECUTE on next_music_track_code to authenticated/.test(fix));
assert(/must stay SECURITY INVOKER/.test(fix));
assert(/must be SECURITY DEFINER/.test(fix));
assert(/search_path must be public, pg_temp/.test(fix));
assert(/owner cannot execute next_music_track_code/.test(fix));

assert(/next_music_track_code must stay SECURITY INVOKER/.test(smoke));
assert(/must be SECURITY DEFINER/.test(smoke));
assert(/search_path must be public, pg_temp/.test(smoke));
assert(/owner cannot execute next_music_track_code/.test(smoke));
assert(/has_function_privilege\('authenticated', 'public\.next_music_track_code\(\)', 'EXECUTE'\)/.test(smoke));
assert(/has_function_privilege\('service_role', 'public\.next_music_track_code\(\)', 'EXECUTE'\)/.test(smoke));
assert(/WHEN insufficient_privilege THEN/.test(smoke));
assert(/permission denied for function next_music_track_code/.test(smoke));
assert(/ROLLBACK;/.test(smoke));

process.stdout.write("music-track-identity-sql-unit: ok\n");
