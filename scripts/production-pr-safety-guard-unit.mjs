#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildSummary,
  CANONICAL_PRODUCTION_HEALTH_URL,
  isFullSha,
  lineageBlockingReasons,
  parseDeployCommit,
  parseDistance,
  resolveProductionHealthUrl,
  validatePrSafetyInput,
} from "./production-pr-safety-guard.mjs";

const prod = "a251297017b07fa3a066a0d9506c7331354e2229";
const main = "a9314c8319cb288e84b305e07d693a97786df7f7";
const pr = "24fec411d1f17a2dadd150eaa04c5a9940be22c3";

assert.equal(parseDeployCommit({ deployCommit: prod.toUpperCase() }), prod);
assert.equal(parseDeployCommit({ deployCommit: "build-id" }), null);
assert.equal(parseDeployCommit({}), null);
assert.equal(isFullSha(pr), true);
assert.equal(isFullSha("not-a-sha"), false);
assert.deepEqual(parseDistance("4 7"), { mainOnly: 4, prOnly: 7 });
assert.deepEqual(parseDistance("invalid"), { mainOnly: null, prOnly: null });
assert.equal(resolveProductionHealthUrl(CANONICAL_PRODUCTION_HEALTH_URL), CANONICAL_PRODUCTION_HEALTH_URL);
assert.throws(
  () => resolveProductionHealthUrl("https://attacker.test/health"),
  /canonical audiolad endpoint/,
);
assert.equal(
  resolveProductionHealthUrl("https://test.example/health", true),
  "https://test.example/health",
);

const validInput = {
  prNumber: "138",
  prState: "open",
  prBaseRef: "main",
  mainSha: main,
  prSha: pr,
};
assert.deepEqual(validatePrSafetyInput(validInput), []);
assert.match(
  validatePrSafetyInput({ ...validInput, prSha: "bad" }).join("\n"),
  /PR head SHA/,
);
assert.match(
  validatePrSafetyInput({ ...validInput, prNumber: "138/main" }).join("\n"),
  /digits only/,
);
assert.match(
  validatePrSafetyInput({ ...validInput, prBaseRef: "release" }).join("\n"),
  /target main/,
);
assert.match(
  validatePrSafetyInput({ ...validInput, prState: "closed" }).join("\n"),
  /must be open/,
);

const safeLineage = {
  prodSha: prod,
  prodKnown: true,
  canCompare: true,
  prodToMain: true,
  prodToPr: true,
  mainToPr: true,
  prToMain: false,
  behind: 0,
  mainChanged: false,
};
assert.deepEqual(lineageBlockingReasons(safeLineage), []);
assert.match(
  lineageBlockingReasons({ ...safeLineage, mainToPr: false, behind: 3 }).join("\n"),
  /behind current main by 3/,
);
assert.match(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: false,
  }).join("\n"),
  /diverged/,
);
assert.match(
  lineageBlockingReasons({ ...safeLineage, prodToMain: false }).join("\n"),
  /production is not an ancestor of current main/,
);
assert.match(
  lineageBlockingReasons({ ...safeLineage, mainChanged: true }).join("\n"),
  /main changed during check/,
);

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
assert.match(workflow, /pull_request_target:/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /pr_number:/);
assert.match(workflow, /fetch-depth: 0/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /concurrency:/);
assert.match(workflow, /github\.event_name/);
assert.match(workflow, /https:\/\/audiolad\.ru\/api\/health\/build/);
assert.match(workflow, /pr_number must contain digits only/);
assert.match(workflow, /must target main/);
assert.match(workflow, /malformed main or PR SHA/);
assert.match(workflow, /Re-read main immediately before verdict/);
assert.doesNotMatch(workflow, /\bssh\b/i);
assert.doesNotMatch(workflow, /DATABASE_URL|SUPABASE.*KEY|production.*secret/i);
const trustedJob = workflow.slice(
  workflow.indexOf("  production-pr-safety:"),
  workflow.indexOf("  pr-repository-validation:"),
);
assert.doesNotMatch(trustedJob, /checkout --detach "\$pr_sha"/);
assert.doesNotMatch(trustedJob, /npm ci/);
assert.match(trustedJob, /github\.event_name == 'pull_request_target'/);
assert.match(
  workflow,
  /production-pr-safety-\$\{\{ github\.event_name \}\}-\$\{\{/,
  "manual dispatch has an event-specific concurrency group",
);

console.log("production-pr-safety-guard-unit: ok");
