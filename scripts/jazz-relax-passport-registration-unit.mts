/**
 * Core task 1313c2b7: help dialog copy, background continuation and
 * registration of a completed album passport independent of publication.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { JazzRelaxPassportHelp } from "../src/components/author-dashboard/product-wizard/JazzRelaxPassportHelp";
import {
  JAZZ_RELAX_PASSPORT_HELP_LINK_LABEL,
  JAZZ_RELAX_PASSPORT_HELP_SECTIONS,
} from "../src/lib/music-passport/jazz-relax-help";
import {
  settleAnalyzerRunWithRetry,
  shouldRegisterAlbumPassport,
} from "../src/lib/music-passport/jazz-relax-pilot";

const read = (path: string) => readFileSync(path, "utf8");

// --- Help dialog ----------------------------------------------------------
assert.equal(JAZZ_RELAX_PASSPORT_HELP_LINK_LABEL, "Зачем нужен музыкальный паспорт?");
const helpText = JAZZ_RELAX_PASSPORT_HELP_SECTIONS.flatMap((s) => [s.heading, ...s.paragraphs]).join("\n");
for (const fact of [/BPM/, /тональность/, /настроение/, /инструменты/, /альбома/]) {
  assert.match(helpText, fact, `help must explain passport properties: ${fact}`);
}
assert.match(helpText, /рекомендациях АудиоЛада/);
assert.match(helpText, /AudioLad Business/);
assert.match(helpText, /допущенных к программе/);
assert.match(helpText, /продолжать редактировать альбом и публиковать его, не дожидаясь завершения/);
assert.match(helpText, /Статус подготовки и готовый результат/);
assert.match(helpText, /не гарантирует/);
assert.doesNotMatch(helpText, /вы получите|гарантированн/i);
assert.match(helpText, /не показывается слушателям/);

const closed = renderToStaticMarkup(createElement(JazzRelaxPassportHelp));
assert.match(closed, /data-passport-help-link="true"/);
assert.match(closed, /aria-haspopup="dialog"/);
assert.match(closed, /Зачем нужен музыкальный паспорт\?/);
assert.match(closed, /<dialog[^>]*aria-labelledby=/);
assert.match(closed, /aria-label="Закрыть"/);
assert.match(closed, /type="button"/);

// --- Placement next to the start button -----------------------------------
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const helpAt = form.indexOf("<JazzRelaxPassportHelp />");
const navAt = form.indexOf("<AuthorProductWizardStepNav", helpAt);
assert.ok(helpAt > 0 && navAt > helpAt && navAt - helpAt < 400, "help link sits right above the step-2 button");

// --- Registration on completion, not on publication -----------------------
assert.equal(shouldRegisterAlbumPassport("completed"), true);
assert.equal(shouldRegisterAlbumPassport("partial"), false);
assert.equal(shouldRegisterAlbumPassport("pending"), false);
assert.equal(shouldRegisterAlbumPassport("failed"), false);

const pilot = read("src/lib/music-passport/jazz-relax-pilot.ts");
assert.match(pilot, /const albumPassportId = await insertAlbum\(practiceId, draft\);\n\s+if \(albumPassportId && shouldRegisterAlbumPassport\(draft\.status\)\) \{\n\s+const registered = await registerAlbumPassport\(albumPassportId\);/);
assert.match(pilot, /rpc\("register_music_album_passport"/);
assert.match(pilot, /jazz_relax_album_passport_registration_failed/);
const registerBody = pilot.slice(pilot.indexOf("async function registerAlbumPassport"));
assert.doesNotMatch(registerBody.slice(0, 1500), /published|is_catalog_listed|status === "published"/);

// Publication code paths do not register passports.
for (const path of [
  "src/app/api/author/products/[id]/music-passport/route.ts",
]) {
  assert.doesNotMatch(read(path), /register_music_album_passport/);
}

const migration = read("supabase/migrations/20261228120000_music_passport_registrations.sql");
assert.match(migration, /album_passport_id uuid NOT NULL UNIQUE/);
assert.match(migration, /ON CONFLICT \(album_passport_id\) DO NOTHING/);
assert.match(migration, /album_passport_not_completed/);
assert.match(migration, /music_passport_registration_immutable/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.music_passport_registrations FROM PUBLIC, anon, authenticated/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.register_music_album_passport\(uuid\) FROM PUBLIC, anon, authenticated/);
assert.match(migration, /passport_completed_at/);
assert.match(migration, /album_passport_version/);
assert.doesNotMatch(migration, /\bUPDATE\s+public\.|\bDELETE\s+FROM\b|INSERT INTO public\.music_passport_registrations[\s\S]*SELECT[\s\S]*FROM public\.music_album_passports\s*;/i);

// --- Worker hook: server-side settle without the author ---------------------
{
  const synced: string[] = [];
  assert.equal(await settleAnalyzerRunWithRetry({
    runId: "run-a",
    lookupPracticeId: async () => "practice-1",
    sync: async (practiceId) => { synced.push(practiceId); },
  }), "synced");
  assert.deepEqual(synced, ["practice-1"]);

  assert.equal(await settleAnalyzerRunWithRetry({
    runId: "run-lab",
    lookupPracticeId: async () => null,
    sync: async () => { throw new Error("must not sync"); },
  }), "not_product_run");

  let calls = 0;
  assert.equal(await settleAnalyzerRunWithRetry({
    runId: "run-b",
    lookupPracticeId: async () => "practice-2",
    sync: async () => {
      calls += 1;
      if (calls < 3) throw new Error("album_passport_registration_failed");
    },
  }), "synced");
  assert.equal(calls, 3, "transient registration failure is retried");

  const origError = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => { logged.push(args.join(" ")); };
  try {
    let tries = 0;
    assert.equal(await settleAnalyzerRunWithRetry({
      runId: "run-c",
      lookupPracticeId: async () => "practice-3",
      sync: async () => { tries += 1; throw new Error("db_down"); },
      attempts: 2,
    }), "failed");
    assert.equal(tries, 2);
  } finally {
    console.error = origError;
  }
  assert.ok(logged.some((line) => line.includes("jazz_relax_passport_settle_failed") && line.includes("db_down")));
}
assert.match(pilot, /export async function settleJazzRelaxPassportForAnalyzerRun/);
assert.match(pilot, /sync: \(practiceId\) => syncPassports\(practiceId, \{ strictRegistration: true \}\)/);
assert.match(pilot, /\.from\("music_passport_analysis_links"\)[\s\S]{0,120}\.eq\("analyzer_run_id", runId\)/);
assert.match(pilot, /if \(!registered && options\.strictRegistration\) \{\n\s+throw new Error\("album_passport_registration_failed"\)/);
// Worker runtime stays generic: no passport tables or pilot imports in it.
assert.doesNotMatch(read("src/lib/music-analyzer-runs/worker-runtime.ts"), /music-passport|register_music_album_passport|music_album_passports/);

console.log("jazz-relax-passport-registration-unit: ok");
