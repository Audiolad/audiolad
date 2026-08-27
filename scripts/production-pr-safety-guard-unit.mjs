#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildSummary,
  parseDeployCommit,
  parseDistance,
} from "./production-pr-safety-guard.mjs";

const prod = "a251297017b07fa3a066a0d9506c7331354e2229";
const main = "a9314c8319cb288e84b305e07d693a97786df7f7";
const pr = "24fec411d1f17a2dadd150eaa04c5a9940be22c3";

assert.equal(parseDeployCommit({ deployCommit: prod.toUpperCase() }), prod);
assert.equal(parseDeployCommit({ deployCommit: "build-id" }), null);
assert.equal(parseDeployCommit({}), null);
assert.deepEqual(parseDistance("4 7"), { mainOnly: 4, prOnly: 7 });
assert.deepEqual(parseDistance("invalid"), { mainOnly: null, prOnly: null });

const blocked = buildSummary({
  healthUrl: "https://example.test/api/health/build",
  prodSha: prod,
  mainSha: main,
  prSha: pr,
  prodToMain: true,
  prodToPr: true,
  mainToPr: false,
  prToMain: false,
  behind: 4,
  ahead: 7,
  mergeBase: prod,
  prodToMainMigrations: "_none_",
  mainToPrMigrations: "A\tsupabase/migrations/20260830120400_example.sql",
  migrations: ["supabase/migrations/20260830120400_example.sql"],
  duplicateVersions: false,
  repositoryChecks: [{ name: "migration validation", ok: true, detail: "passed" }],
  reasons: ["PR is behind current main by 4 commits"],
  ok: false,
});

assert.match(blocked, /LIVE PROD/);
assert.match(blocked, /ORIGIN MAIN/);
assert.match(blocked, /PR HEAD/);
assert.match(blocked, /❌ BLOCK MERGE/);
assert.match(blocked, /not\*\* a deploy approval/);

const workflow = readFileSync(".github/workflows/pr-production-safety.yml", "utf8");
assert.match(workflow, /pull_request:/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /pr_number:/);
assert.match(workflow, /fetch-depth: 0/);
assert.match(workflow, /concurrency:/);
assert.match(workflow, /https:\/\/audiolad\.ru\/api\/health\/build/);
assert.doesNotMatch(workflow, /\bssh\b/i);
assert.doesNotMatch(workflow, /pull_request_target/);
assert.doesNotMatch(workflow, /DATABASE_URL|SUPABASE.*KEY|production.*secret/i);

console.log("production-pr-safety-guard-unit: ok");
