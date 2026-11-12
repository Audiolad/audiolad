#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildSummary,
  CANONICAL_PRODUCTION_HEALTH_URL,
  isFullSha,
  isPostMergeHeadLag,
  lineageBlockingReasons,
  parseDeployCommit,
  parseDistance,
  readLiveProductionCommit,
  resolveProductionHealthUrl,
  validatePrSafetyInput,
  writeDiagnostics,
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

const validHealth = await readLiveProductionCommit(
  CANONICAL_PRODUCTION_HEALTH_URL,
  async () => new Response(JSON.stringify({ status: "ok", deployCommit: prod }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  }),
);
assert.deepEqual(validHealth, {
  commit: prod,
  httpStatus: 200,
  contentType: "application/json",
  reason: null,
});
const invalidJsonHealth = await readLiveProductionCommit(
  CANONICAL_PRODUCTION_HEALTH_URL,
  async () => new Response("untrusted arbitrary response body", {
    status: 200,
    headers: { "content-type": "application/json" },
  }),
);
assert.equal(invalidJsonHealth.reason, "health endpoint returned invalid JSON");
assert.equal(invalidJsonHealth.contentType, "application/json");
const httpFailureHealth = await readLiveProductionCommit(
  CANONICAL_PRODUCTION_HEALTH_URL,
  async () => new Response("untrusted arbitrary response body", {
    status: 503,
    headers: { "content-type": "text/html" },
  }),
);
assert.equal(httpFailureHealth.reason, "health endpoint returned HTTP 503");
assert.equal(httpFailureHealth.contentType, "text/html");
const networkFailureHealth = await readLiveProductionCommit(
  CANONICAL_PRODUCTION_HEALTH_URL,
  async () => { throw new Error("untrusted network error"); },
);
assert.equal(networkFailureHealth.reason, "health endpoint could not be read");
const missingCommitHealth = await readLiveProductionCommit(
  CANONICAL_PRODUCTION_HEALTH_URL,
  async () => new Response(JSON.stringify({ status: "ok", deployCommit: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }),
);
assert.equal(
  missingCommitHealth.reason,
  "health endpoint did not provide a valid deployCommit",
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

// PR #757 / run 37142717256: head 60716d9 was already green. The trusted run
// started at pre-merge main b716419, then observed merge commit 8ae8d71
// (parents b716419, 60716d9). The head was 0 ahead and exactly 1 behind.
const pr757Lag = {
  mainSha: "8ae8d71f179a01f7b3454b85c277bdc86c0f721c",
  prSha: "60716d9eeb664eb69d1cdd02699f72ee525abce4",
  startMainSha: "b71641941102c2702d8272d1d11de0d1fdfb9cdb",
  behind: 1,
  ahead: 0,
  mainToPr: false,
  prToMain: true,
  mainParents: [
    "b71641941102c2702d8272d1d11de0d1fdfb9cdb",
    "60716d9eeb664eb69d1cdd02699f72ee525abce4",
  ],
};
assert.equal(isPostMergeHeadLag(pr757Lag), true);
assert.equal(
  isPostMergeHeadLag({
    ...pr757Lag,
    mainSha: pr757Lag.mainSha.toUpperCase(),
    mainParents: pr757Lag.mainParents.map((parent) => parent.toUpperCase()),
  }),
  true,
);
assert.deepEqual(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: true,
    behind: 1,
    ahead: 0,
    postMergeHeadLag: true,
  }),
  [],
);
assert.match(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: true,
    behind: 1,
    ahead: 0,
    postMergeHeadLag: true,
    prodToMain: false,
  }).join("\n"),
  /production is not an ancestor of current main/,
);
assert.doesNotMatch(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: true,
    behind: 1,
    ahead: 0,
    postMergeHeadLag: true,
    prodSha: null,
    healthReason: "health endpoint returned HTTP 503",
  }).join("\n"),
  /behind current main/,
);
assert.match(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: true,
    behind: 1,
    ahead: 0,
    postMergeHeadLag: true,
    prodSha: null,
    healthReason: "health endpoint returned HTTP 503",
  }).join("\n"),
  /health endpoint returned HTTP 503/,
);
assert.match(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: true,
    behind: 1,
    ahead: 0,
    postMergeHeadLag: true,
    mainChanged: true,
  }).join("\n"),
  /main changed during check/,
);
assert.match(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: true,
    behind: 1,
    ahead: 0,
  }).join("\n"),
  /behind current main by 1/,
);
assert.match(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: true,
    behind: 4,
    ahead: 0,
    postMergeHeadLag: true,
  }).join("\n"),
  /behind current main by 4/,
);
assert.match(
  lineageBlockingReasons({
    ...safeLineage,
    mainToPr: false,
    prToMain: false,
    behind: 1,
    ahead: 2,
    postMergeHeadLag: true,
  }).join("\n"),
  /diverged/,
);
assert.equal(isPostMergeHeadLag({ ...pr757Lag, behind: 4 }), false);
assert.equal(isPostMergeHeadLag({ ...pr757Lag, ahead: 1 }), false);
assert.equal(isPostMergeHeadLag({ ...pr757Lag, prToMain: false }), false);
assert.equal(isPostMergeHeadLag({ ...pr757Lag, mainToPr: true }), false);
assert.equal(isPostMergeHeadLag({ ...pr757Lag, startMainSha: pr757Lag.mainSha }), false);
assert.equal(
  isPostMergeHeadLag({ ...pr757Lag, mainParents: [pr757Lag.prSha] }),
  false,
);
assert.equal(
  isPostMergeHeadLag({
    ...pr757Lag,
    mainParents: [pr757Lag.startMainSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  }),
  false,
);
assert.equal(
  isPostMergeHeadLag({
    ...pr757Lag,
    prSha: pr757Lag.startMainSha,
    mainParents: [pr757Lag.startMainSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  }),
  false,
);
assert.equal(isPostMergeHeadLag({ ...pr757Lag, mainParents: [pr757Lag.startMainSha, "not-a-sha"] }), false);
assert.equal(isPostMergeHeadLag(null), false);

const lagRepo = mkdtempSync(join(tmpdir(), "pr-safety-lag-"));
try {
  const git = (args) => execFileSync("git", ["-C", lagRepo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Audiolad Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Audiolad Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  }).trim();
  git(["init", "-b", "main"]);
  git(["commit", "--allow-empty", "-m", "pre-merge main"]);
  const start = git(["rev-parse", "HEAD"]);
  git(["checkout", "-b", "pr"]);
  git(["commit", "--allow-empty", "-m", "pr head"]);
  const head = git(["rev-parse", "HEAD"]);
  git(["checkout", "main"]);
  git(["merge", "--no-ff", "pr", "-m", "merge pr"]);
  const merged = git(["rev-parse", "HEAD"]);
  const mergedParents = git(["log", "-1", "--format=%P", merged]).split(/\s+/);
  assert.deepEqual(mergedParents, [start, head]);
  assert.equal(git(["rev-list", "--left-right", "--count", `${merged}...${head}`]), "1\t0");
  assert.equal(isPostMergeHeadLag({
    mainSha: merged,
    prSha: head,
    startMainSha: start,
    behind: 1,
    ahead: 0,
    mainToPr: false,
    prToMain: true,
    mainParents: mergedParents,
  }), true);
  git(["commit", "--allow-empty", "-m", "ordinary commit on main"]);
  const ordinary = git(["rev-parse", "HEAD"]);
  const ordinaryParents = git(["log", "-1", "--format=%P", ordinary]).split(/\s+/);
  assert.equal(isPostMergeHeadLag({
    mainSha: ordinary,
    prSha: merged,
    startMainSha: start,
    behind: 1,
    ahead: 0,
    mainToPr: false,
    prToMain: true,
    mainParents: ordinaryParents,
  }), false);
} finally {
  rmSync(lagRepo, { recursive: true, force: true });
}
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
  healthHttpStatus: 200,
  healthContentType: "application/json",
  healthReason: null,
  mainSha: main,
  finalMainSha: main,
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
  duplicateMigrationVersions: "20260830120400",
  migrationScanOk: true,
  canCompare: true,
  repositoryChecks: [{ name: "migration validation", ok: true, detail: "passed" }],
  reasons: [
    "health endpoint returned invalid JSON",
    "production is not an ancestor of current main",
    "production is not an ancestor of this PR",
    "PR is behind current main by 4 commits",
    "main changed during check; rerun required",
    "duplicate migration versions: 20260830120400",
  ],
  ok: false,
});

assert.match(blocked, /LIVE PROD/);
assert.match(blocked, /ORIGIN MAIN/);
assert.match(blocked, /PR HEAD/);
assert.match(blocked, /❌ BLOCK MERGE/);
assert.match(blocked, /not\*\* a deploy approval/);
assert.match(blocked, /\| decision \| BLOCK \|/);
assert.match(blocked, /\| production_health_http \| 200 \|/);
assert.match(blocked, /\| production_health_content_type \| application\/json \|/);
assert.match(blocked, /\| production_is_ancestor_of_main \| true \|/);
assert.match(blocked, /\| duplicate_migration_versions \| 20260830120400 \|/);
for (const reason of [
  "health endpoint returned invalid JSON",
  "production is not an ancestor of current main",
  "production is not an ancestor of this PR",
  "PR is behind current main by 4 commits",
  "main changed during check; rerun required",
  "duplicate migration versions: 20260830120400",
]) {
  assert.match(blocked, new RegExp(reason));
}
assert.doesNotMatch(blocked, /untrusted arbitrary response body/);
assert.doesNotMatch(blocked, /untrusted network error/);

const safe = buildSummary({
  healthUrl: CANONICAL_PRODUCTION_HEALTH_URL,
  prodSha: prod,
  healthHttpStatus: 200,
  healthContentType: "application/json",
  healthReason: null,
  mainSha: main,
  finalMainSha: main,
  prSha: pr,
  prodToMain: true,
  prodToPr: true,
  mainToPr: true,
  prToMain: false,
  mainChanged: false,
  behind: 0,
  ahead: 1,
  mergeBase: main,
  prodToMainMigrations: "_none_",
  mainToPrMigrations: "_none_",
  migrations: [],
  duplicateVersions: false,
  duplicateMigrationVersions: "",
  migrationScanOk: true,
  canCompare: true,
  repositoryChecks: [{ name: "migration validation", ok: true, detail: "passed" }],
  reasons: [],
  ok: true,
});
assert.match(safe, /\| decision \| SAFE \|/);
assert.match(safe, /✅ SAFE TO CONTINUE REVIEW/);
assert.match(safe, /\| post_merge_head_lag \| no \|/);
assert.doesNotMatch(safe, /Post-merge head lag is exempted/);

const exemptedLag = buildSummary({
  healthUrl: CANONICAL_PRODUCTION_HEALTH_URL,
  prodSha: prod,
  healthHttpStatus: 200,
  healthContentType: "application/json",
  healthReason: null,
  mainSha: "8ae8d71f179a01f7b3454b85c277bdc86c0f721c",
  startMainSha: "b71641941102c2702d8272d1d11de0d1fdfb9cdb",
  finalMainSha: "8ae8d71f179a01f7b3454b85c277bdc86c0f721c",
  prSha: "60716d9eeb664eb69d1cdd02699f72ee525abce4",
  prodToMain: true,
  prodToPr: true,
  mainToPr: false,
  prToMain: true,
  mainChanged: false,
  postMergeHeadLag: true,
  behind: 1,
  ahead: 0,
  mergeBase: "60716d9eeb664eb69d1cdd02699f72ee525abce4",
  prodToMainMigrations: "_none_",
  mainToPrMigrations: "_none_",
  migrations: [],
  duplicateVersions: false,
  duplicateMigrationVersions: "",
  migrationScanOk: true,
  canCompare: true,
  repositoryChecks: [{ name: "migration validation", ok: true, detail: "passed" }],
  reasons: [],
  ok: true,
});
assert.match(exemptedLag, /\| post_merge_head_lag \| exempted \|/);
assert.match(exemptedLag, /\| main_is_ancestor_of_pr \| false \|/);
assert.match(exemptedLag, /PR is 1 commits behind current main/);
assert.match(exemptedLag, /Post-merge head lag is exempted/);
assert.match(exemptedLag, /\| decision \| SAFE \|/);
assert.match(exemptedLag, /✅ SAFE TO CONTINUE REVIEW/);

let ordinaryLog = "";
writeDiagnostics(safe, {
  write(value) {
    ordinaryLog += value;
  },
});
writeDiagnostics(blocked, {
  write(value) {
    ordinaryLog += value;
  },
});
assert.match(ordinaryLog, /\| decision \| SAFE \|/);
assert.match(ordinaryLog, /\| decision \| BLOCK \|/);
for (const reason of [
  "health endpoint returned invalid JSON",
  "production is not an ancestor of current main",
  "production is not an ancestor of this PR",
  "PR is behind current main by 4 commits",
  "main changed during check; rerun required",
  "duplicate migration versions: 20260830120400",
]) {
  assert.match(ordinaryLog, new RegExp(reason));
}
assert.doesNotMatch(ordinaryLog, /untrusted arbitrary response body/);

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
assert.match(trustedWorkflow, /PR_SAFETY_START_MAIN_SHA: \$\{\{ env\.TRUSTED_MAIN_SHA \}\}/);
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
const guardSource = readFileSync("scripts/production-pr-safety-guard.mjs", "utf8");
assert.match(guardSource, /writeDiagnostics\(summary\)/);
assert.doesNotMatch(guardSource, /response\.text\(\)/);
assert.match(guardSource, /PR_SAFETY_START_MAIN_SHA/);
assert.match(guardSource, /process\.env\.TRUSTED_MAIN_SHA/);
assert.match(guardSource, /isPostMergeHeadLag\(/);
const lagDecision = guardSource.indexOf("const postMergeHeadLag = isPostMergeHeadLag");
const duplicateDecision = guardSource.indexOf("duplicate migration versions:");
assert.ok(lagDecision > 0 && duplicateDecision > lagDecision);
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
assert.match(docs, /Post-merge head lag/);
assert.match(docs, /exactly 0 ahead and 1 behind/);

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
