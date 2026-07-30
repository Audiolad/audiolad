import assert from "node:assert/strict";
import { assertSafeTestEnvironment } from "./private-to-catalog-player-race-smoke.mjs";

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
console.log("private-to-catalog-player-race-safety-unit: ok");
