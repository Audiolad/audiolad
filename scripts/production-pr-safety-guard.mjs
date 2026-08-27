#!/usr/bin/env node
/**
 * Read-only Production / PR Safety guard.
 *
 * This script uses the public production health endpoint and local Git history
 * only. It does not use SSH, production credentials, or any database access.
 */
import { execFileSync, spawnSync } from "node:child_process";

const FULL_SHA = /^[0-9a-f]{40}$/i;
export const CANONICAL_PRODUCTION_HEALTH_URL =
  "https://audiolad.ru/api/health/build";
const healthUrl = process.env.AUDIOLAD_PRODUCTION_HEALTH_URL ??
  CANONICAL_PRODUCTION_HEALTH_URL;
const mainSha = process.env.PR_SAFETY_MAIN_SHA?.trim() ?? "";
const finalMainSha = process.env.PR_SAFETY_FINAL_MAIN_SHA?.trim() ?? "";
const prSha = process.env.PR_SAFETY_PR_SHA?.trim() ?? "";
const workflowSha = process.env.PR_SAFETY_WORKFLOW_SHA?.trim() ?? "";
const prNumber = process.env.PR_SAFETY_PR_NUMBER?.trim() ?? "";
const prState = process.env.PR_SAFETY_PR_STATE?.trim() ?? "";
const prBaseRef = process.env.PR_SAFETY_PR_BASE_REF?.trim() ?? "";
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function shortSha(sha) {
  return sha ? sha.slice(0, 12) : "unknown";
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function gitResult(args) {
  try {
    return { ok: true, output: git(args) };
  } catch (error) {
    return {
      ok: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

function isAncestor(ancestor, descendant) {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { stdio: "ignore" },
  );
  return result.status === 0;
}

export function isFullSha(value) {
  return typeof value === "string" && FULL_SHA.test(value.trim());
}

export function parseDeployCommit(payload) {
  return typeof payload?.deployCommit === "string" &&
    FULL_SHA.test(payload.deployCommit.trim())
    ? payload.deployCommit.trim().toLowerCase()
    : null;
}

export function validatePrSafetyInput(input) {
  const reasons = [];
  if (!/^[0-9]+$/.test(String(input.prNumber ?? ""))) {
    reasons.push("PR number must contain digits only");
  }
  if (input.prState !== "open") {
    reasons.push("PR must be open");
  }
  if (input.prBaseRef !== "main") {
    reasons.push("PR must target main");
  }
  if (!isFullSha(input.mainSha)) {
    reasons.push("current origin/main SHA is unavailable or invalid");
  }
  if (!isFullSha(input.prSha)) {
    reasons.push("current PR head SHA is unavailable or invalid");
  }
  return reasons;
}

export function resolveProductionHealthUrl(input, allowTestInjection = false) {
  if (!input || input === CANONICAL_PRODUCTION_HEALTH_URL) {
    return CANONICAL_PRODUCTION_HEALTH_URL;
  }
  if (allowTestInjection) {
    return input;
  }
  throw new Error("production health URL must be the canonical audiolad endpoint");
}

export function lineageBlockingReasons(input) {
  const reasons = [];
  if (!input.prodSha) {
    reasons.push(input.healthReason ?? "health endpoint did not provide a valid deployCommit");
  } else if (!input.prodKnown) {
    reasons.push("live production commit is absent from fetched repository history");
  }
  if (input.canCompare && !input.prodToMain) {
    reasons.push("production is not an ancestor of current main");
  }
  if (input.canCompare && !input.prodToPr) {
    reasons.push("production is not an ancestor of this PR");
  }
  if (input.canCompare && !input.mainToPr) {
    reasons.push(`PR is behind current main by ${input.behind ?? "unknown"} commits`);
  }
  if (input.canCompare && !input.mainToPr && !input.prToMain) {
    reasons.push("main and PR have diverged");
  }
  if (input.mainChanged) {
    reasons.push("main changed during check; rerun required");
  }
  return reasons;
}

export function parseDistance(value) {
  const [mainOnly, prOnly] = String(value)
    .trim()
    .split(/\s+/)
    .map((item) => Number.parseInt(item, 10));

  return {
    mainOnly: Number.isSafeInteger(mainOnly) ? mainOnly : null,
    prOnly: Number.isSafeInteger(prOnly) ? prOnly : null,
  };
}

export function buildSummary(input) {
  const migrationLines = (input.migrations ?? []).length
    ? input.migrations.map((line) => `- \`${line}\``).join("\n")
    : "_none_";
  const checks = (input.repositoryChecks ?? [])
    .map((check) => `${check.ok ? "✅" : "❌"} ${check.name} — ${check.detail}`)
    .join("\n");
  const reasons = input.reasons.length
    ? input.reasons.map((reason) => `- ${reason}`).join("\n")
    : "_none_";

  return `# Production / PR Safety

## Commits

| Source | Full SHA | Short SHA |
|---|---|---|
| LIVE PROD | ${input.prodSha ?? "unavailable"} | ${shortSha(input.prodSha)} |
| ORIGIN MAIN | ${input.mainSha || "unavailable"} | ${shortSha(input.mainSha)} |
| PR HEAD | ${input.prSha || "unavailable"} | ${shortSha(input.prSha)} |
| WORKFLOW SHA | ${input.workflowSha || "unavailable"} | ${shortSha(input.workflowSha)} |

Health endpoint: \`${input.healthUrl}\`

## Lineage

${input.prodToMain ? "✅" : "❌"} PROD → MAIN  
${input.prodToPr ? "✅" : "❌"} PROD → PR  
${input.mainToPr ? "✅" : "❌"} MAIN → PR  
${input.prToMain ? "✅" : "❌"} PR → MAIN  
Merge base: \`${input.mergeBase ?? "unavailable"}\`  
PR is ${input.behind ?? "unknown"} commits behind current main.  
PR is ${input.ahead ?? "unknown"} commits ahead of current main.
${input.mainChanged ? `
⚠️ MAIN CHANGED DURING CHECK<br>
Start: \`${input.mainSha}\`<br>
End: \`${input.finalMainSha}\`
` : ""}

## Migration changes

### PROD → MAIN
${input.prodToMainMigrations || "_unavailable_"}

### MAIN → PR
${input.mainToPrMigrations || "_unavailable_"}

### New PR migrations
${migrationLines}

Migration versions: ${input.duplicateVersions ? "❌ duplicates found" : "✅ unique"}

## Repository checks

${checks}

## VERDICT

${input.ok ? "✅ SAFE TO CONTINUE REVIEW" : "❌ BLOCK MERGE"}

This check is read-only and is **not** a deploy approval. It does not replace
staging, live RLS integration, runtime smoke, or explicit production approval.

### Blocking reasons
${reasons}
`;
}

async function readLiveProductionCommit(resolvedHealthUrl) {
  try {
    const response = await fetch(resolvedHealthUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { commit: null, reason: `health endpoint returned HTTP ${response.status}` };
    }
    return {
      commit: parseDeployCommit(await response.json()),
      reason: null,
    };
  } catch {
    return { commit: null, reason: "health endpoint could not be read" };
  }
}

function diffNameStatus(from, to) {
  const result = gitResult(["diff", "--name-status", `${from}..${to}`, "--", "supabase/migrations"]);
  return result.ok ? result.output || "_none_" : "_unavailable_";
}

function migrationVersionDuplicates(ref) {
  const result = gitResult([
    "ls-tree",
    "-r",
    "--name-only",
    ref,
    "--",
    "supabase/migrations",
  ]);
  if (!result.ok) {
    return { ok: false, duplicates: [] };
  }

  const versions = new Map();
  for (const filename of result.output.split("\n").filter(Boolean)) {
    const match = filename.split("/").at(-1)?.match(/^(\d{8,})_/);
    if (!match) continue;
    const files = versions.get(match[1]) ?? [];
    files.push(filename);
    versions.set(match[1], files);
  }

  return {
    ok: true,
    duplicates: [...versions.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([version, files]) => ({ version, files })),
  };
}

async function main() {
  const reasons = [];
  let resolvedHealthUrl;
  try {
    resolvedHealthUrl = resolveProductionHealthUrl(
      healthUrl,
      process.env.PR_SAFETY_ALLOW_TEST_HEALTH_URL === "1",
    );
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "invalid production health URL");
    resolvedHealthUrl = CANONICAL_PRODUCTION_HEALTH_URL;
  }
  const live = await readLiveProductionCommit(resolvedHealthUrl);
  const prodSha = live.commit;

  reasons.push(...validatePrSafetyInput({
    prNumber,
    prState,
    prBaseRef,
    mainSha,
    prSha,
  }));
  const mainChanged = isFullSha(finalMainSha) &&
    isFullSha(mainSha) &&
    finalMainSha.toLowerCase() !== mainSha.toLowerCase();
  if (!isFullSha(finalMainSha)) {
    reasons.push("final origin/main SHA is unavailable or invalid");
  }

  let prodKnown = false;
  if (prodSha) {
    prodKnown = gitResult(["cat-file", "-e", `${prodSha}^{commit}`]).ok;
    if (!prodKnown) reasons.push("live production commit is absent from fetched repository history");
  }

  const canCompare = Boolean(prodSha && prodKnown && isFullSha(mainSha) && isFullSha(prSha));
  const prodToMain = canCompare && isAncestor(prodSha, mainSha);
  const prodToPr = canCompare && isAncestor(prodSha, prSha);
  const mainToPr = canCompare && isAncestor(mainSha, prSha);
  const prToMain = canCompare && isAncestor(prSha, mainSha);
  const distanceResult = canCompare
    ? gitResult(["rev-list", "--left-right", "--count", `${mainSha}...${prSha}`])
    : { ok: false, output: "" };
  const distance = parseDistance(distanceResult.output);
  const mergeBaseResult = canCompare
    ? gitResult(["merge-base", mainSha, prSha])
    : { ok: false, output: "" };

  reasons.push(...lineageBlockingReasons({
    prodSha,
    prodKnown,
    healthReason: live.reason,
    canCompare,
    prodToMain,
    prodToPr,
    mainToPr,
    prToMain,
    behind: distance.mainOnly,
    mainChanged,
  }));

  const migrationNames = canCompare
    ? gitResult(["diff", "--name-only", `${mainSha}..${prSha}`, "--", "supabase/migrations"])
    : { ok: false, output: "" };
  const migrations = migrationNames.ok
    ? migrationNames.output.split("\n").filter(Boolean)
    : [];
  const duplicateScan = isFullSha(prSha)
    ? migrationVersionDuplicates(prSha)
    : { ok: false, duplicates: [] };
  const duplicateVersions = !duplicateScan.ok || duplicateScan.duplicates.length > 0;
  if (!duplicateScan.ok) {
    reasons.push("could not scan PR migration versions from fetched Git objects");
  } else if (duplicateScan.duplicates.length > 0) {
    reasons.push(
      `duplicate migration versions: ${duplicateScan.duplicates.map(({ version }) => version).join(", ")}`,
    );
  }

  const summary = buildSummary({
    healthUrl: resolvedHealthUrl,
    prodSha,
    mainSha,
    prSha,
    workflowSha,
    finalMainSha,
    mainChanged,
    prodToMain,
    prodToPr,
    mainToPr,
    prToMain,
    behind: distance.mainOnly,
    ahead: distance.prOnly,
    mergeBase: mergeBaseResult.ok ? mergeBaseResult.output : null,
    prodToMainMigrations: canCompare ? diffNameStatus(prodSha, mainSha) : null,
    mainToPrMigrations: canCompare ? diffNameStatus(mainSha, prSha) : null,
    migrations,
    duplicateVersions,
    repositoryChecks: [
      {
        name: "trusted static migration version scan",
        ok: duplicateScan.ok && duplicateScan.duplicates.length === 0,
        detail: duplicateScan.ok
          ? duplicateScan.duplicates.length === 0
            ? "unique"
            : `duplicates: ${duplicateScan.duplicates.map(({ version }) => version).join(", ")}`
          : "could not read PR Git tree",
      },
    ],
    reasons,
    ok: reasons.length === 0,
  });

  if (summaryPath) {
    await (await import("node:fs/promises")).appendFile(summaryPath, summary);
  } else {
    console.log(summary);
  }

  if (reasons.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
