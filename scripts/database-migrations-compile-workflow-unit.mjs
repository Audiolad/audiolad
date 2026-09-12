#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/database-migrations-compile-isolated.yml",
  "utf8",
);
const driver = readFileSync("scripts/database-migrations-compile-isolated.mjs", "utf8");

assert.match(workflow, /pull_request:/);
assert.match(workflow, /supabase\/postgres:15\.14\.1\.171/);
assert.match(workflow, /node scripts\/database-migrations-compile-isolated\.mjs/);
assert.doesNotMatch(workflow, /postgres:16/);
assert.doesNotMatch(workflow, /POSTGRES_DB:/);
assert.doesNotMatch(workflow, /POSTGRES_USER:/);
assert.match(workflow, /pg_isready -U supabase_admin -d postgres/);
assert.match(workflow, /AUDIOLAD_MIGRATION_COMPILE_ADMIN_URL/);
assert.doesNotMatch(workflow, /pull_request_target:/);
assert.doesNotMatch(workflow, /secrets\./);
assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /supabase\/migrations\/\*\*/);
assert.match(workflow, /supabase\/baseline\/\*\*/);
assert.match(workflow, /supabase-compile-pre-unified-audio-seed\.sql/);
assert.match(driver, /applyFile\("Supabase prerequisites"/);
assert.match(driver, /applyFile\("post-apply analytics smoke"/);
assert.match(driver, /CREATE DATABASE \$\{expectedDatabase\}/);
assert.match(driver, /20260714180000/);
assert.match(driver, /20261006120000/);
assert.match(driver, /20261006120200/);
assert.match(driver, /planDatabaseMigrations/);
assert.doesNotMatch(driver, /\bgrep\b/i);

console.log("database-migrations-compile-workflow-unit: ok");
