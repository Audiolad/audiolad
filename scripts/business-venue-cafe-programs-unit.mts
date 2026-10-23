// Venue player reads cafe programs next to spa programs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BUSINESS_VENUE_PROGRAM_KINDS,
  isBusinessVenueProgramKind,
  pickVenueProgram,
  venueProgramKindForCategory,
} from "../src/lib/business-app/venue-programs";
import { BUSINESS_ONBOARDING_TYPES } from "../src/lib/business-app/onboarding-wizard";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// --- pure choice ------------------------------------------------------------
assert.deepEqual([...BUSINESS_VENUE_PROGRAM_KINDS], ["spa", "cafe"]);
assert.equal(isBusinessVenueProgramKind("cafe"), true);
assert.equal(isBusinessVenueProgramKind("retail"), false);
assert.equal(isBusinessVenueProgramKind(null), false);

const spaOld = { id: "a", name: "Спа", kind: "spa", created_at: "2026-10-13T00:00:00Z" };
const cafeNew = { id: "b", name: "Кафе", kind: "cafe", created_at: "2026-10-23T00:00:00Z" };
const retail = { id: "c", name: "Ритейл", kind: "retail", created_at: "2026-01-01T00:00:00Z" };

assert.equal(pickVenueProgram([], "cafe"), null);
assert.equal(pickVenueProgram([retail], "retail"), null, "unknown kinds never play");
assert.equal(pickVenueProgram([cafeNew], "cafe")?.id, "b", "cafe venue gets its cafe program");
assert.equal(pickVenueProgram([spaOld, cafeNew], "cafe")?.id, "b", "category match beats age");
assert.equal(pickVenueProgram([cafeNew, spaOld], "spa")?.id, "a", "spa venue keeps spa program");
assert.equal(pickVenueProgram([cafeNew, spaOld], " SPA ")?.id, "a", "category normalised");
assert.equal(pickVenueProgram([cafeNew, spaOld], "gym")?.id, "a", "no match: oldest (previous behaviour)");
assert.equal(pickVenueProgram([cafeNew, spaOld], null)?.id, "a");
assert.equal(
  pickVenueProgram([{ ...cafeNew, id: "z", created_at: spaOld.created_at }, { ...cafeNew, id: "y", created_at: spaOld.created_at }], "cafe")?.id,
  "y",
  "tie broken by id",
);
assert.equal(pickVenueProgram([retail, spaOld], "retail")?.id, "a");

// --- server code uses the shared list, not a hardcoded spa ----------------
const pilot = read("src/lib/business-app/spa-pilot.ts");
const admin = read("src/lib/business-app/spa-admin.ts");
for (const [name, src] of [["spa-pilot", pilot], ["spa-admin", admin]] as const) {
  assert.doesNotMatch(src, /\.eq\("kind", "spa"\)/, `${name}: no spa-only filter`);
}
assert.match(admin, /\.in\("kind", \[\.\.\.BUSINESS_VENUE_PROGRAM_KINDS\]\)/, "spa-admin: shared kinds");
assert.match(pilot, /\.in\("kind", \[\.\.\.kinds\]\)/, "spa-pilot: kind filter");
assert.match(pilot, /loadOldestProgram\(BUSINESS_VENUE_PROGRAM_KINDS\)/, "spa-pilot: fallback over shared kinds");
assert.match(pilot, /pickVenueProgram\(programs, location\.business_category/);
assert.ok(pilot.indexOf(".eq(\"enabled\", true)") < pilot.indexOf("pickVenueProgram("), "allowlist gate first");
assert.match(pilot, /rpc\("business_spa_program_manifest"/, "tracks only from the ELIGIBLE manifest");
assert.doesNotMatch(read("src/lib/business-app/venue-programs.ts"), /server-only|supabase/);

// --- SQL: only the kind filter changes ---------------------------------------
const oldMig = read("supabase/migrations/20261231160000_business_player_live_state.sql");
const newMig = read("supabase/migrations/20270122130000_business_venue_player_cafe_programs.sql");
function body(src: string, name: string): string {
  const i = src.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`));
  assert.ok(i >= 0, `${name} present`);
  const start = src.indexOf("AS $$", i);
  return src.slice(start, src.indexOf("$$;", start + 5) + 3);
}
for (const name of ["report_business_spa_player_playback", "get_business_owner_player_live_state"]) {
  const before = body(oldMig, name);
  const after = body(newMig, name);
  assert.equal((before.match(/bp\.kind = 'spa'/g) ?? []).length, 1, `${name}: one spa filter before`);
  assert.equal(after, before.replace("bp.kind = 'spa'", "bp.kind IN ('spa', 'cafe')"), `${name}: only the kind filter changes`);
  assert.match(after, /resolve_business_track_eligibility\([\s\S]*'ELIGIBLE'/, `${name}: rights gate kept`);
  assert.ok(newMig.includes(`CREATE OR REPLACE FUNCTION public.${name}(`));
}
assert.ok(newMig.includes("GRANT EXECUTE ON FUNCTION public.report_business_spa_player_playback(uuid, text, text, uuid, boolean, text) TO authenticated;"));
assert.ok(newMig.includes("GRANT EXECUTE ON FUNCTION public.get_business_owner_player_live_state(uuid) TO authenticated;"));
assert.doesNotMatch(newMig, /\b(INSERT|UPDATE|DELETE)\s+(INTO\s+)?public\.business_programs/i, "no data writes in the migration");

// --- persisted onboarding categories map to program kinds --------------------
assert.equal(venueProgramKindForCategory("Кафе"), "cafe");
assert.equal(venueProgramKindForCategory(" кафе "), "cafe");
assert.equal(venueProgramKindForCategory("Спа"), "spa");
assert.equal(venueProgramKindForCategory("cafe"), "cafe");
assert.equal(venueProgramKindForCategory("spa"), "spa");
assert.equal(venueProgramKindForCategory("Магазин"), null);
assert.equal(venueProgramKindForCategory(null), null);
{
  const both = [
    { id: "s", name: "spa", kind: "spa", created_at: "2026-01-01T00:00:00Z" },
    { id: "c", name: "cafe", kind: "cafe", created_at: "2026-02-01T00:00:00Z" },
  ];
  const byCategory = new Map(BUSINESS_ONBOARDING_TYPES.map((t) => [t.category, t] as const));
  assert.equal(pickVenueProgram(both, byCategory.get("Кафе")?.category)?.id, "c", "onboarding «Кафе» gets cafe program");
  assert.equal(pickVenueProgram(both, byCategory.get("Спа")?.category)?.id, "s", "onboarding «Спа» gets spa program");
  assert.equal(pickVenueProgram(both, "Магазин")?.id, "s", "unknown category falls back to oldest");
}
{
  const pilotSrc = read("src/lib/business-app/spa-pilot.ts");
  assert.match(pilotSrc, /venueProgramKindForCategory\(location\.business_category/);
  assert.match(pilotSrc, /loadOldestProgram\(\[preferredKind\]\)/, "matching kind queried first");
  assert.doesNotMatch(pilotSrc, /\.limit\(20\)/, "no candidate cap that could hide the matching program");
}

// --- owner rule: no "no rights-confirmed tracks" claim on venue surfaces -----
for (const file of [
  "src/components/business-app/SpaOnlinePlayer.tsx",
  "src/components/business-app/SpaPilotPlayer.tsx",
  "src/lib/business-app/eligibility.ts",
  "src/lib/access-grants/copy.ts",
]) {
  const src = read(file);
  assert.doesNotMatch(src, /нет треков с подтвержд[её]нными правами/, `${file}: neutral empty state`);
}
assert.match(read("src/components/business-app/SpaOnlinePlayer.tsx"), /data-testid="spa-empty">Подборка готовится – /);

console.log("business-venue-cafe-programs-unit: all tests passed");
