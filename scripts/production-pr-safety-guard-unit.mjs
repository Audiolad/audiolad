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
import { resolveTrustedCommitStatus } from "./production-pr-safety-status.mjs";

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
assert.deepEqual(
  resolveTrustedCommitStatus({ guardOutcome: "success", guardState: "success" }),
  {
    state: "success",
    description: "SAFE TO CONTINUE REVIEW (not deployment approval)",
  },
);
assert.deepEqual(
  resolveTrustedCommitStatus({ guardOutcome: "failure", guardState: "failure" }),
  {
    state: "failure",
    description: "BLOCK MERGE — see trusted safety summary",
  },
);
assert.deepEqual(
  resolveTrustedCommitStatus({ guardOutcome: "failure", guardState: "" }),
  {
    state: "error",
    description: "Trusted production lineage check had an internal error",
  },
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

const trustedWorkflow = readFileSync(
  ".github/workflows/production-pr-safety-trusted.yml",
  "utf8",
);
const validationWorkflow = readFileSync(
  ".github/workflows/pr-repository-validation.yml",
  "utf8",
);
assert.match(trustedWorkflow, /pull_request_target:/);
assert.doesNotMatch(trustedWorkflow, /^\s+pull_request:/m);
assert.match(trustedWorkflow, /workflow_dispatch:/);
assert.match(trustedWorkflow, /pr_number:/);
assert.match(trustedWorkflow, /statuses: write/);
assert.match(trustedWorkflow, /context='Production \/ PR Safety'/);
assert.match(trustedWorkflow, /statuses\/\$\{PR_SHA\}/);
assert.doesNotMatch(trustedWorkflow, /statuses\/\$\{\{\s*github\.sha\s*\}\}/);
assert.match(trustedWorkflow, /Set trusted status pending on PR head/);
assert.match(trustedWorkflow, /if: always\(\).*pull_request_target.*steps\.refs\.outcome == 'success'/);
assert.match(
  trustedWorkflow,
  /steps\.refs\.outcome == 'success' && steps\.final-main\.outcome == 'success'/,
);
assert.match(trustedWorkflow, /Re-read main immediately before verdict/);
assert.match(trustedWorkflow, /pr_number must contain digits only/);
assert.match(trustedWorkflow, /must target main/);
assert.match(trustedWorkflow, /malformed main or PR SHA/);
assert.match(trustedWorkflow, /production-pr-safety-\$\{\{ github\.event_name \}\}-\$\{\{/);
assert.doesNotMatch(trustedWorkflow, /\bssh\b/i);
assert.doesNotMatch(trustedWorkflow, /DATABASE_URL|SUPABASE.*KEY|production.*secret/i);
assert.doesNotMatch(trustedWorkflow, /actions\/checkout/);
assert.doesNotMatch(trustedWorkflow, /\bgit submodule\b/);
assert.doesNotMatch(trustedWorkflow, /\bgit checkout\b/);
assert.match(trustedWorkflow, /git -C "\$\{OBJECT_STORE\}" init --quiet/);
assert.match(
  trustedWorkflow,
  /fetch --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main/,
);
assert.match(trustedWorkflow, /TRUSTED_MAIN_SHA=.*rev-parse refs\/remotes\/origin\/main/);
assert.match(
  trustedWorkflow,
  /\$\{TRUSTED_MAIN_SHA\}:scripts\/production-pr-safety-guard\.mjs/,
);
assert.match(
  trustedWorkflow,
  /\$\{TRUSTED_MAIN_SHA\}:scripts\/production-pr-safety-status\.mjs/,
);
assert.match(
  trustedWorkflow,
  /cd "\$\{OBJECT_STORE\}"\s+node "\$\{TRUSTED_DIR\}\/production-pr-safety-guard\.mjs"/,
);
const trustedJob = trustedWorkflow.slice(
  trustedWorkflow.indexOf("  production-pr-safety-runner:"),
);
assert.doesNotMatch(trustedJob, /checkout --detach "\$pr_sha"/);
assert.doesNotMatch(trustedJob, /npm ci/);
assert.match(trustedJob, /github\.event_name == 'pull_request_target'/);
assert.match(
  validationWorkflow,
  /pull_request:/,
);
assert.doesNotMatch(validationWorkflow, /pull_request_target:/);
assert.doesNotMatch(validationWorkflow, /statuses: write/);
assert.doesNotMatch(validationWorkflow, /actions\/checkout/);
assert.doesNotMatch(validationWorkflow, /\bgit submodule\b/);
assert.doesNotMatch(validationWorkflow, /\bgit checkout\b/);
assert.match(
  validationWorkflow,
  /github\.event\.pull_request\.head\.sha/,
  "ordinary validation reads the PR SHA only from event metadata",
);
assert.match(validationWorkflow, /git -C "\$\{OBJECT_STORE\}" archive "\$\{PR_SHA\}" \| tar -x -C "\$\{PR_WORKSPACE\}"/);
assert.match(validationWorkflow, /working-directory: \$\{\{ env\.PR_WORKSPACE \}\}/);
assert.match(validationWorkflow, /\^\[0-9a-fA-F\]\{40\}\$/);
assert.match(validationWorkflow, /\^https:\/\/github\\\.com\//);

const docs = readFileSync("docs/ci-production-pr-safety.md", "utf8");
assert.match(docs, /separate .*PR Repository Validation.*workflow/is);
assert.match(docs, /does not write the trusted status context/);
assert.match(docs, /commit status.*Production \/ PR Safety/is);
assert.match(docs, /isolated Git object store/);
assert.match(docs, /git archive/);
assert.match(docs, /test:database-migrations:ci/);
assert.match(docs, /full\s+self-hosted\/local suite/);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const ciMigrationSuite = packageJson.scripts["test:database-migrations:ci"];
assert.ok(ciMigrationSuite, "CI-safe migration suite must exist");
assert.match(ciMigrationSuite, /AUDIOLAD_SKIP_ISOLATED_SQL=1 node scripts\/catalog-foundation-sql-unit\.mjs/);
assert.match(ciMigrationSuite, /AUDIOLAD_SKIP_ISOLATED_SQL=1 node scripts\/playlist-catalog-foundation-sql-unit\.mjs/);
assert.equal(
  validationWorkflow.includes("npm run test:database-migrations:ci"),
  true,
  "GitHub-hosted validation must not invoke the full self-hosted suite",
);
assert.equal(
  validationWorkflow.includes("npm run test:database-migrations\n"),
  false,
  "GitHub-hosted validation must not require supabase-db",
);

const catalogFoundationSql = readFileSync(
  "scripts/catalog-foundation-sql-unit.mjs",
  "utf8",
);
const playlistFoundationSql = readFileSync(
  "scripts/playlist-catalog-foundation-sql-unit.mjs",
  "utf8",
);
for (const sqlUnit of [catalogFoundationSql, playlistFoundationSql]) {
  assert.match(sqlUnit, /AUDIOLAD_SKIP_ISOLATED_SQL === "1"/);
  assert.match(sqlUnit, /!skipIsolatedSql && \(dockerAvailable\(\) \|\| localPostgresAvailable\(\)\)/);
}

console.log("production-pr-safety-guard-unit: ok");
