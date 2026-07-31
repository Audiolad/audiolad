import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeTestEnvironment } from "./private-to-catalog-player-race-smoke.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SMOKE_SOURCE = readFileSync(
  path.join(ROOT, "scripts/private-to-catalog-player-race-smoke.mjs"),
  "utf8",
);

const valid = {
  AUDIOLAD_TEST_DATABASE: "1",
  AUDIOLAD_ALLOW_MUTATING_SMOKE: "1",
  AUDIOLAD_TEST_BASE_URL: "http://127.0.0.1:3000",
  AUDIOLAD_TEST_SUPABASE_URL: "http://127.0.0.1:54321",
  AUDIOLAD_TEST_SUPABASE_SERVICE_ROLE_KEY: "test-only-key",
  AUDIOLAD_TEST_DB_CONTAINER: "audiolad-test-db",
  AUDIOLAD_TEST_DB_NAME: "audiolad_private_catalog_race_test",
};

for (const [name, env] of [
  ["missing marker", { ...valid, AUDIOLAD_TEST_DATABASE: undefined }],
  ["missing opt-in", { ...valid, AUDIOLAD_ALLOW_MUTATING_SMOKE: undefined }],
  ["production base", { ...valid, AUDIOLAD_TEST_BASE_URL: "https://audiolad.ru" }],
  ["production supabase", { ...valid, AUDIOLAD_TEST_SUPABASE_URL: "https://api.audiolad.ru" }],
  ["bad container", { ...valid, AUDIOLAD_TEST_DB_CONTAINER: "supabase-db" }],
  ["bad database", { ...valid, AUDIOLAD_TEST_DB_NAME: "postgres" }],
]) {
  assert.throws(() => assertSafeTestEnvironment(env), undefined, name);
}

const result = assertSafeTestEnvironment(valid);
assert.equal(result.baseUrl, "http://127.0.0.1:3000");
assert.equal(result.supabaseUrl, "http://127.0.0.1:54321");
assert.equal(result.serviceRoleKey, "test-only-key");
assert.equal(
  "NEXT_PUBLIC_SUPABASE_URL" in result,
  false,
  "guard result must not expose unvalidated NEXT_PUBLIC_SUPABASE_URL",
);

// authCookies must derive the cookie project ref from the guarded supabaseUrl.
const authCookiesFn = SMOKE_SOURCE.slice(
  SMOKE_SOURCE.indexOf("async function authCookies"),
  SMOKE_SOURCE.indexOf("async function waitForAudioPlaying"),
);
assert.match(
  authCookiesFn,
  /createClient\(\s*env\.supabaseUrl/,
  "authCookies signs in against guarded supabaseUrl",
);
assert.match(
  authCookiesFn,
  /new URL\(env\.supabaseUrl\)/,
  "authCookies projectRef uses guarded supabaseUrl",
);
assert.doesNotMatch(
  authCookiesFn,
  /NEXT_PUBLIC_SUPABASE_URL/,
  "authCookies must not re-read NEXT_PUBLIC_SUPABASE_URL after the guard",
);
assert.doesNotMatch(
  SMOKE_SOURCE,
  /NEXT_PUBLIC_SUPABASE_URL/,
  "smoke must not treat NEXT_PUBLIC_SUPABASE_URL as a source of truth",
);
assert.doesNotMatch(
  SMOKE_SOURCE,
  /\.env\.local/,
  "smoke must not load production .env.local",
);

// runViewport: guard → fixture writes → authCookies (same guarded env object).
const runViewportFn = SMOKE_SOURCE.slice(
  SMOKE_SOURCE.indexOf("async function runViewport"),
  SMOKE_SOURCE.indexOf("async function main"),
);
const guardIdx = runViewportFn.indexOf("assertSafeTestEnvironment()");
const fixtureIdx = runViewportFn.indexOf("createPrivateFixture(env)");
const cookiesIdx = runViewportFn.indexOf(
  "authCookies(env, env.baseUrl, fixture.email, fixture.password)",
);
const cleanupIdx = runViewportFn.indexOf("cleanupFixture(fixture)");
assert.ok(guardIdx >= 0, "runViewport calls safety guard");
assert.ok(fixtureIdx > guardIdx, "fixture writes run only after safety guard");
assert.ok(
  cookiesIdx > fixtureIdx,
  "authCookies runs with the same guarded env after fixture creation",
);
assert.ok(cleanupIdx > cookiesIdx, "cleanup remains after smoke body");
assert.match(runViewportFn, /finally\s*\{/, "cleanup is in finally");

console.log("private-to-catalog-player-race-safety-unit: ok");
