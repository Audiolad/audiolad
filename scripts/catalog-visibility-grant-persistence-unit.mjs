#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildDockerPsqlArgs,
  parseAllowedDatabaseName,
  parseAllowedDatabaseUrl,
} from "./catalog-visibility-grant-persistence.mjs";

const DEFAULT_DB = "audiolad_pr138_visibility_test";
const safeUrl = `postgresql://reader:secret@localhost:5432/${DEFAULT_DB}`;

assert.deepEqual(parseAllowedDatabaseUrl(undefined), {
  ok: false,
  reason: "database URL is required",
});
assert.equal(parseAllowedDatabaseUrl(safeUrl).ok, true);
assert.match(
  parseAllowedDatabaseUrl("postgresql://host/postgres").reason,
  /unsafe database name: postgres/,
);
assert.match(
  parseAllowedDatabaseUrl("postgresql://host/template1").reason,
  /unsafe database name: template1/,
);
assert.match(
  parseAllowedDatabaseUrl("postgresql://host/audiolad_production").reason,
  /not allowed/,
);
assert.equal(
  parseAllowedDatabaseUrl(
    "postgresql://host/audiolad_other_isolated",
    "audiolad_other_isolated",
  ).ok,
  true,
);
assert.equal(
  parseAllowedDatabaseUrl(
    "postgresql://host/audiolad_other_isolated",
    "different_database",
  ).ok,
  false,
);
assert.equal(parseAllowedDatabaseName(DEFAULT_DB).ok, true);
for (const unsafeDatabase of ["postgres", "template0", "template1"]) {
  assert.match(
    parseAllowedDatabaseName(unsafeDatabase).reason,
    /unsafe database name/,
  );
}
assert.equal(
  parseAllowedDatabaseName("audiolad_other_isolated").ok,
  false,
  "Docker transport rejects arbitrary database names",
);
assert.equal(
  parseAllowedDatabaseName(
    "audiolad_other_isolated",
    "audiolad_other_isolated",
  ).ok,
  true,
  "Docker transport accepts only an exact opt-in database name",
);
const dockerArgs = buildDockerPsqlArgs({
  container: "supabase-db",
  user: "supabase_admin",
  databaseName: DEFAULT_DB,
});
assert.deepEqual(dockerArgs.slice(0, 5), [
  "exec",
  "-i",
  "supabase-db",
  "psql",
  "-U",
]);
assert.deepEqual(dockerArgs.slice(5), [
  "supabase_admin",
  "-d",
  DEFAULT_DB,
  "-v",
  "ON_ERROR_STOP=1",
]);
assert.equal(dockerArgs.includes("postgres"), false);

const transactionSql = readFileSync(
  "supabase/tests/catalog_visibility_grant_persistence_copy.sql",
  "utf8",
);
const postcheckSql = readFileSync(
  "supabase/tests/catalog_visibility_grant_persistence_postcheck.sql",
  "utf8",
);
const doBlocks = transactionSql.match(/DO \$\$[\s\S]*?\$\$;/g) ?? [];

assert.ok(doBlocks.length > 0, "fixture must contain assertion DO blocks");
for (const block of doBlocks) {
  assert.doesNotMatch(
    block,
    /(?<!:):(?:'[^']+'|[A-Za-z_][A-Za-z0-9_]*)/,
    "psql variable syntax is forbidden inside dollar-quoted DO blocks",
  );
}
assert.match(transactionSql, /^BEGIN;$/m);
assert.match(transactionSql, /^ROLLBACK;$/m);
assert.match(transactionSql, /SET LOCAL ROLE authenticated/);
assert.match(transactionSql, /RESET ROLE/);
assert.match(transactionSql, /INSERT INTO public\.user_practices/);
assert.match(transactionSql, /'admin'/);
assert.match(transactionSql, /\\echo before_grant/);
assert.match(transactionSql, /\\echo after_grant/);
assert.match(transactionSql, /\\echo after_allowlist_removal/);
assert.match(postcheckSql, /\\echo after_rollback/);
assert.match(postcheckSql, /catalog_visibility = 'listed'/);
assert.match(postcheckSql, /is_catalog_listed IS TRUE/);
assert.doesNotMatch(
  transactionSql,
  /(?:p\.)?author_id\s*=\s*'3f840bf3-e5e4-4d42-a4ad-db7010861e1d'::uuid/,
  "author user UUID must never be compared to practices.author_id",
);
assert.doesNotMatch(
  transactionSql,
  /author_members(?:\s+AS\s+\w+)?\s*(?:AS\s+\w+)?[\s\S]{0,200}author_id\s*=\s*'3f840bf3-e5e4-4d42-a4ad-db7010861e1d'::uuid/,
  "author user UUID must never be treated as author_members.author_id",
);
assert.match(
  transactionSql,
  /FROM public\.practices AS p\s+JOIN public\.author_members AS am ON am\.author_id = p\.author_id/,
);
assert.match(
  transactionSql,
  /am\.user_id = '3f840bf3-e5e4-4d42-a4ad-db7010861e1d'::uuid/,
);
assert.match(
  transactionSql,
  /am\.author_id = \(\s+SELECT p\.author_id FROM public\.practices AS p/,
);

const runner = readFileSync("scripts/catalog-visibility-grant-persistence.mjs", "utf8");
assert.match(runner, /AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DATABASE_URL/);
assert.match(runner, /DEFAULT_ALLOWED_DATABASE = "audiolad_pr138_visibility_test"/);
assert.match(runner, /\["postgres", "template0", "template1"\]/);
assert.match(runner, /runUrlPsql\(databaseUrl, sqlPath\)/);
assert.match(runner, /runDockerPsql\(dockerArgs, sqlPath\)/);
assert.match(runner, /AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_TRANSPORT/);
assert.match(runner, /transport === "docker"/);
assert.match(runner, /if \(databaseUrl\) \{[\s\S]*?\} else if \(transport === "docker"\)/);
assert.match(runner, /AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DOCKER_CONTAINER/);
assert.match(runner, /AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_PSQL_USER/);
assert.match(runner, /docker.*exec.*-i/s);
assert.match(runner, /input: readFileSync\(sqlPath, "utf8"\)/);
assert.doesNotMatch(runner, /\|\|\s*true/);

console.log("catalog-visibility-grant-persistence-unit: ok");
