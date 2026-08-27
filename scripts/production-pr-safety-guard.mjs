#!/usr/bin/env node
/**
 * Read-only Production / PR Safety guard.
 *
 * This script uses the public production health endpoint and local Git history
 * only. It does not use SSH, production credentials, or any database access.
 */
import { execFileSync, spawnSync } from "node:child_process";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const healthUrl =
  process.env.AUDIOLAD_PRODUCTION_HEALTH_URL ??
  "https://audiolad.ru/api/health/build";
const mainSha = process.env.PR_SAFETY_MAIN_SHA?.trim() ?? "";
const prSha = process.env.PR_SAFETY_PR_SHA?.trim() ?? "";
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

function commandCheck(name, command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  return {
    name,
    ok: result.status === 0,
    detail: result.status === 0 ? "passed" : `exit ${result.status ?? "unknown"}`,
  };
}

export function parseDeployCommit(payload) {
  return typeof payload?.deployCommit === "string" &&
    FULL_SHA.test(payload.deployCommit.trim())
    ? payload.deployCommit.trim().toLowerCase()
    : null;
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

Health endpoint: \`${input.healthUrl}\`

## Lineage

${input.prodToMain ? "✅" : "❌"} PROD → MAIN  
${input.prodToPr ? "✅" : "❌"} PROD → PR  
${input.mainToPr ? "✅" : "❌"} MAIN → PR  
${input.prToMain ? "✅" : "❌"} PR → MAIN  
Merge base: \`${input.mergeBase ?? "unavailable"}\`  
PR is ${input.behind ?? "unknown"} commits behind current main.  
PR is ${input.ahead ?? "unknown"} commits ahead of current main.

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

async function readLiveProductionCommit() {
  try {
    const response = await fetch(healthUrl, {
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

async function main() {
  const reasons = [];
  const repositoryChecks = [];
  const live = await readLiveProductionCommit();
  const prodSha = live.commit;

  if (!prodSha) {
    reasons.push(live.reason ?? "health endpoint did not provide a valid deployCommit");
  }
  if (!FULL_SHA.test(mainSha)) reasons.push("current origin/main SHA is unavailable or invalid");
  if (!FULL_SHA.test(prSha)) reasons.push("current PR head SHA is unavailable or invalid");

  let prodKnown = false;
  if (prodSha) {
    prodKnown = gitResult(["cat-file", "-e", `${prodSha}^{commit}`]).ok;
    if (!prodKnown) reasons.push("live production commit is absent from fetched repository history");
  }

  const canCompare = Boolean(prodSha && prodKnown && FULL_SHA.test(mainSha) && FULL_SHA.test(prSha));
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

  if (canCompare && !prodToMain) reasons.push("production is not an ancestor of current main");
  if (canCompare && !prodToPr) reasons.push("production is not an ancestor of this PR");
  if (canCompare && !mainToPr) {
    reasons.push(`PR is behind current main by ${distance.mainOnly ?? "unknown"} commits`);
  }
  if (canCompare && !mainToPr && !prToMain) reasons.push("main and PR have diverged");

  const duplicateCheck = commandCheck(
    "duplicate migration versions",
    "npm",
    ["run", "test:duplicate-migration-versions"],
  );
  repositoryChecks.push(duplicateCheck);
  const migrationCheck = commandCheck(
    "migration validation",
    "npm",
    ["run", "test:database-migrations"],
  );
  repositoryChecks.push(migrationCheck);
  repositoryChecks.push(commandCheck("build", "npm", ["run", "build"]));
  repositoryChecks.push(commandCheck("typecheck", "npm", ["run", "typecheck"]));
  repositoryChecks.push(commandCheck("lint", "npm", ["run", "lint"]));

  for (const check of repositoryChecks) {
    if (!check.ok) reasons.push(`repository check failed: ${check.name}`);
  }

  const migrationNames = canCompare
    ? gitResult(["diff", "--name-only", `${mainSha}..${prSha}`, "--", "supabase/migrations"])
    : { ok: false, output: "" };
  const migrations = migrationNames.ok
    ? migrationNames.output.split("\n").filter(Boolean)
    : [];
  const duplicateVersions = !duplicateCheck.ok;

  const summary = buildSummary({
    healthUrl,
    prodSha,
    mainSha,
    prSha,
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
    repositoryChecks,
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
