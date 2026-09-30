import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRIDGE_STATUS_CONTEXT,
  HEALTH_BUILD_URL,
  HEALTH_DEPENDENCIES_URL,
  HOMEPAGE_URL,
  IGNORED_EVIDENCE_CHECK_NAMES,
  REMOTE_DEPLOY_COMMAND,
  REQUIRED_CHECK_NAME,
  REQUIRED_STATUS_CONTEXT,
  RESULT_SCHEMA,
  buildResult,
  classifyOutcome,
  evaluateGate,
  evaluateHealth,
  githubPublication,
  loadGateFacts,
  publishDeploymentResult,
  selectCommitSha,
} from "./deployment-bridge-policy.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const policyPath = join(repoRoot, "scripts/deployment-bridge-policy.mjs");
const workflowPath = join(repoRoot, ".github/workflows/deployment-bridge.yml");
const docsPath = join(repoRoot, "docs/deployment-bridge.md");

const MAIN = "a".repeat(40);
const HEAD = "b".repeat(40);
const MERGE = "c".repeat(40);
const TREE = "d".repeat(40);
const OTHER_TREE = "e".repeat(40);

function greenChecks(extra = []) {
  return [
    { name: REQUIRED_CHECK_NAME, status: "completed", conclusion: "success" },
    ...extra,
  ];
}

function greenStatuses() {
  return [{ context: REQUIRED_STATUS_CONTEXT, state: "success" }];
}

function mergeFacts(overrides = {}) {
  return {
    requestedSha: MERGE,
    originMainSha: MAIN,
    isCommit: true,
    isAncestor: true,
    parents: [MAIN, HEAD],
    trees: { [MERGE]: TREE, [HEAD]: TREE },
    checks: {
      [MERGE]: [],
      [HEAD]: greenChecks(),
    },
    statuses: {
      [MERGE]: [],
      [HEAD]: greenStatuses(),
    },
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function parseWorkflow(text) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys, yaml
data = yaml.safe_load(sys.stdin.read())
if True in data and "on" not in data:
    data["on"] = data.pop(True)
print(json.dumps(data))
`,
    ],
    { input: text, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function testSelectCommitSha() {
  const sha = MERGE;
  assert.deepEqual(
    selectCommitSha({
      eventName: "workflow_dispatch",
      inputCommitSha: `  ${sha}\n`,
      clientPayload: null,
    }),
    { ok: true, commitSha: sha },
  );
  assert.equal(
    selectCommitSha({
      eventName: "workflow_dispatch",
      inputCommitSha: sha,
      clientPayload: { commit_sha: sha },
    }).error,
    "unexpected_payload",
  );
  assert.equal(
    selectCommitSha({
      eventName: "workflow_dispatch",
      inputCommitSha: "main",
      clientPayload: null,
    }).error,
    "invalid_commit_sha",
  );
  assert.equal(
    selectCommitSha({
      eventName: "workflow_dispatch",
      inputCommitSha: MERGE.toUpperCase(),
      clientPayload: null,
    }).error,
    "invalid_commit_sha",
  );
  assert.deepEqual(
    selectCommitSha({
      eventName: "repository_dispatch",
      inputCommitSha: "",
      clientPayload: { commit_sha: sha },
    }),
    { ok: true, commitSha: sha },
  );
  assert.equal(
    selectCommitSha({
      eventName: "repository_dispatch",
      inputCommitSha: "",
      clientPayload: { commit_sha: sha, command: "id" },
    }).error,
    "unexpected_payload",
  );
  assert.equal(
    selectCommitSha({
      eventName: "repository_dispatch",
      inputCommitSha: sha,
      clientPayload: { commit_sha: sha },
    }).error,
    "unexpected_payload",
  );
  assert.equal(
    selectCommitSha({
      eventName: "push",
      inputCommitSha: sha,
      clientPayload: null,
    }).error,
    "unsupported_event",
  );
}

function testGateAllowsEqualTreeMerge() {
  const decision = evaluateGate(mergeFacts());
  assert.equal(decision.ok, true);
  assert.equal(decision.deploySha, MERGE);
  assert.equal(decision.ciSubjectSha, HEAD);
}

function testGateAllowsCiOnTheDeployShaItself() {
  const decision = evaluateGate(
    mergeFacts({
      parents: [MAIN],
      trees: { [MERGE]: TREE },
      checks: { [MERGE]: greenChecks() },
      statuses: { [MERGE]: greenStatuses() },
    }),
  );
  assert.equal(decision.ok, true);
  assert.equal(decision.ciSubjectSha, MERGE);
}

function testGateRejectsOffMainAndBadShapes() {
  assert.equal(evaluateGate(mergeFacts({ isAncestor: false })).error, "not_on_main");
  assert.equal(evaluateGate(mergeFacts({ isCommit: false })).error, "not_on_main");
  assert.equal(
    evaluateGate(mergeFacts({ parents: [MAIN, HEAD, "f".repeat(40)] })).error,
    "unsupported_merge_shape",
  );
  assert.equal(evaluateGate(mergeFacts({ requestedSha: "not-a-sha" })).error, "invalid_commit_sha");
}

function testGateRejectsTreeMismatchAndRedCi() {
  const mismatch = evaluateGate(
    mergeFacts({
      trees: { [MERGE]: TREE, [HEAD]: OTHER_TREE },
    }),
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "tree_mismatch");

  const pending = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: [],
        [HEAD]: [{ name: REQUIRED_CHECK_NAME, status: "in_progress", conclusion: null }],
      },
    }),
  );
  assert.equal(pending.error, "ci_pending");

  const failed = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: [],
        [HEAD]: greenChecks([
          { name: "Studio Catalog Render FFmpeg", status: "completed", conclusion: "failure" },
        ]),
      },
    }),
  );
  assert.equal(failed.error, "ci_not_green");

  const missingSafety = evaluateGate(
    mergeFacts({
      statuses: { [MERGE]: [], [HEAD]: [] },
    }),
  );
  assert.equal(missingSafety.error, "ci_not_green");

  const rerun = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: [],
        [HEAD]: [
          {
            name: REQUIRED_CHECK_NAME,
            status: "completed",
            conclusion: "failure",
            completed_at: "2026-09-30T00:00:00.000Z",
          },
          {
            name: REQUIRED_CHECK_NAME,
            status: "completed",
            conclusion: "success",
            completed_at: "2026-09-30T00:05:00.000Z",
          },
        ],
      },
    }),
  );
  assert.equal(rerun.ok, true);

  const newerFailure = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: [],
        [HEAD]: [
          {
            name: REQUIRED_CHECK_NAME,
            status: "completed",
            conclusion: "success",
            completed_at: "2026-09-30T00:00:00.000Z",
          },
          {
            name: REQUIRED_CHECK_NAME,
            status: "completed",
            conclusion: "failure",
            completed_at: "2026-09-30T00:05:00.000Z",
          },
        ],
      },
    }),
  );
  assert.equal(newerFailure.error, "ci_not_green");

  const ownStatusDoesNotBlock = evaluateGate(
    mergeFacts({
      statuses: {
        [MERGE]: [],
        [HEAD]: [
          ...greenStatuses(),
          { context: BRIDGE_STATUS_CONTEXT, state: "failure" },
        ],
      },
      checks: {
        [MERGE]: [],
        [HEAD]: greenChecks([
          { name: BRIDGE_STATUS_CONTEXT, status: "completed", conclusion: "failure" },
        ]),
      },
    }),
  );
  assert.equal(ownStatusDoesNotBlock.ok, true);

  const redOnDeployShaBlocksEqualParent = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: [{ name: "extra", status: "completed", conclusion: "failure" }],
        [HEAD]: greenChecks(),
      },
    }),
  );
  assert.equal(redOnDeployShaBlocksEqualParent.error, "ci_not_green");
}

function testGateAcceptsTwoParentMergeAfterBridgeAndRunnerNoise() {
  const bridgeJobNoise = [
    {
      name: "Gate commit",
      status: "completed",
      conclusion: "failure",
      completed_at: "2026-09-30T18:45:57.000Z",
    },
    {
      name: "Gate commit",
      status: "in_progress",
      conclusion: null,
      started_at: "2026-09-30T18:46:10.000Z",
    },
    {
      name: "Deploy pinned SHA",
      status: "completed",
      conclusion: "skipped",
      completed_at: "2026-09-30T18:45:58.000Z",
    },
    {
      name: "Refuse dispatch outside main",
      status: "completed",
      conclusion: "skipped",
      completed_at: "2026-09-30T18:45:43.000Z",
    },
    {
      name: BRIDGE_STATUS_CONTEXT,
      status: "completed",
      conclusion: "failure",
      completed_at: "2026-09-30T18:45:55.000Z",
    },
  ];
  const decision = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: bridgeJobNoise,
        [HEAD]: [
          {
            name: REQUIRED_CHECK_NAME,
            status: "completed",
            conclusion: "success",
            completed_at: "2026-09-30T18:39:24.000Z",
          },
          {
            name: REQUIRED_CHECK_NAME,
            status: "completed",
            conclusion: "success",
            completed_at: "2026-09-30T18:50:49.000Z",
          },
          {
            name: "Production / PR Safety Runner",
            status: "completed",
            conclusion: "success",
            completed_at: "2026-09-30T18:33:49.000Z",
          },
          {
            name: "Production / PR Safety Runner",
            status: "completed",
            conclusion: "failure",
            completed_at: "2026-09-30T18:45:29.000Z",
          },
        ],
      },
      statuses: {
        [MERGE]: [{ context: BRIDGE_STATUS_CONTEXT, state: "failure" }],
        [HEAD]: [
          {
            context: REQUIRED_STATUS_CONTEXT,
            state: "success",
            updated_at: "2026-09-30T18:33:42.000Z",
          },
        ],
      },
    }),
  );
  assert.equal(decision.ok, true);
  assert.equal(decision.deploySha, MERGE);
  assert.equal(decision.ciSubjectSha, HEAD);

  const laterSkippedRunner = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: bridgeJobNoise,
        [HEAD]: greenChecks([
          {
            name: "Production / PR Safety Runner",
            status: "completed",
            conclusion: "failure",
            completed_at: "2026-09-30T18:45:29.000Z",
          },
          {
            name: "Production / PR Safety Runner",
            status: "completed",
            conclusion: "skipped",
            completed_at: "2026-09-30T18:46:00.000Z",
          },
        ]),
      },
    }),
  );
  assert.equal(laterSkippedRunner.ok, true);
  assert.equal(laterSkippedRunner.ciSubjectSha, HEAD);

  const runnerDoesNotReplaceRequiredEvidence = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: bridgeJobNoise,
        [HEAD]: [
          {
            name: "Production / PR Safety Runner",
            status: "completed",
            conclusion: "success",
            completed_at: "2026-09-30T18:33:49.000Z",
          },
        ],
      },
      statuses: {
        [MERGE]: [],
        [HEAD]: [{ context: REQUIRED_STATUS_CONTEXT, state: "success" }],
      },
    }),
  );
  assert.equal(runnerDoesNotReplaceRequiredEvidence.ok, false);
  assert.equal(runnerDoesNotReplaceRequiredEvidence.error, "ci_not_green");

  const unrelatedMergeFailureStillBlocks = evaluateGate(
    mergeFacts({
      checks: {
        [MERGE]: [
          ...bridgeJobNoise,
          { name: "extra", status: "completed", conclusion: "failure" },
        ],
        [HEAD]: greenChecks(),
      },
    }),
  );
  assert.equal(unrelatedMergeFailureStillBlocks.error, "ci_not_green");
}

function testHealthAndClassification() {
  const health = evaluateHealth({
    expectedSha: MERGE,
    homepageStatus: 200,
    buildStatus: 200,
    buildBody: { status: "ok", deployCommit: MERGE.toUpperCase() },
    dependenciesStatus: 200,
    dependenciesBody: { status: "ok", database: "ok" },
  });
  assert.equal(health.ok, true);
  assert.equal(health.build.deploy_commit, MERGE);

  const mismatch = evaluateHealth({
    expectedSha: MERGE,
    homepageStatus: 200,
    buildStatus: 200,
    buildBody: { status: "ok", deployCommit: HEAD },
    dependenciesStatus: 200,
    dependenciesBody: { status: "ok", database: "ok" },
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "health_build_failed");

  const degraded = evaluateHealth({
    expectedSha: MERGE,
    homepageStatus: 200,
    buildStatus: 200,
    buildBody: { status: "ok", deployCommit: MERGE },
    dependenciesStatus: 503,
    dependenciesBody: { status: "degraded", database: "unavailable" },
  });
  assert.equal(degraded.error, "health_dependencies_failed");

  assert.deepEqual(
    classifyOutcome({ deployExitCode: 0, deployStdout: "deploy_succeeded\n", health }),
    { state: "succeeded", rollback: "not_invoked", error: null },
  );
  assert.equal(
    classifyOutcome({ deployExitCode: 0, deployStdout: "", health: mismatch }).state,
    "failed",
  );
  assert.equal(
    classifyOutcome({
      deployExitCode: 1,
      deployStdout: "rollback_succeeded target=/var/www/audiolad-deploy/releases/old\n",
      health: mismatch,
    }).state,
    "rolled_back",
  );
  assert.equal(
    classifyOutcome({
      deployExitCode: 1,
      deployStdout: "rollback_succeeded\nrollback_failed\n",
      health: mismatch,
    }).state,
    "failed",
  );
  assert.equal(
    classifyOutcome({
      deployExitCode: 1,
      deployStdout: "cleanup_failed_candidate\n",
      health,
    }).error,
    "deploy_failed",
  );
  assert.equal(
    classifyOutcome({
      deployExitCode: 0,
      deployStdout: "rollback_succeeded\n",
      health,
    }).error,
    "unexpected_rollback_marker",
  );
  assert.equal(classifyOutcome({ deployExitCode: 0, deployStdout: "", health: null }).state, "failed");
}

function testPublication() {
  assert.equal(githubPublication("queued").description, "state=queued");
  assert.equal(githubPublication("queued").checkConclusion, null);
  assert.equal(githubPublication("succeeded").commitState, "success");
  assert.equal(githubPublication("rolled_back").commitState, "failure");
  assert.equal(githubPublication("rolled_back").description, "state=rolled_back");
  assert.throws(() => githubPublication("success"), /invalid_bridge_state/);

  const calls = [];
  const result = buildResult({
    state: "rolled_back",
    commitSha: MERGE,
    originMainSha: MAIN,
    ciSubjectSha: HEAD,
    initiator: "oriy",
    eventName: "repository_dispatch",
    runId: "42",
    runUrl: "https://github.com/Audiolad/audiolad/actions/runs/42",
    startedAt: "2026-09-30T00:00:00.000Z",
    finishedAt: "2026-09-30T00:10:00.000Z",
    health: null,
    rollback: "detected",
    error: "rolled_back",
  });
  assert.equal(result.schema, RESULT_SCHEMA);

  return publishDeploymentResult({
    request: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), authorization: init.headers.Authorization });
      return jsonResponse({});
    },
    token: "token-must-not-leak",
    repository: "Audiolad/audiolad",
    result,
  }).then(() => {
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/statuses\/c{40}$/);
    assert.equal(calls[0].body.context, BRIDGE_STATUS_CONTEXT);
    assert.equal(calls[0].body.description, "state=rolled_back");
    assert.equal(calls[0].body.state, "failure");
    assert.equal(calls[1].body.name, BRIDGE_STATUS_CONTEXT);
    assert.equal(calls[1].body.conclusion, "failure");
    assert.equal(calls[1].body.head_sha, MERGE);
    const summary = JSON.parse(calls[1].body.output.summary);
    assert.equal(summary.state, "rolled_back");
    assert.equal(summary.commit_sha, MERGE);
    for (const call of calls) {
      assert.notEqual(call.body.context, REQUIRED_STATUS_CONTEXT);
      assert.notEqual(call.body.name, REQUIRED_CHECK_NAME);
      assert.equal(JSON.stringify(call.body).includes("token-must-not-leak"), false);
    }
  });
}

async function testLoadGateFactsDoesNotFetchCiOffMain() {
  const calls = [];
  const requests = [];
  const git = (args) => {
    calls.push(args.join(" "));
    if (args[0] === "cat-file") {
      return { status: 1, stdout: "", stderr: "missing" };
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  const facts = await loadGateFacts({
    git,
    request: async (url) => {
      requests.push(url);
      return jsonResponse({});
    },
    repository: "Audiolad/audiolad",
    token: "t",
    originMainSha: MAIN,
    commitSha: MERGE,
  });
  assert.equal(facts.isCommit, false);
  assert.equal(requests.length, 0);
  assert.equal(calls.some((call) => call.startsWith("fetch")), false);

  const ancestorCalls = [];
  const ancestorFacts = await loadGateFacts({
    git: (args) => {
      ancestorCalls.push(args.join(" "));
      if (args[0] === "cat-file") {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "merge-base") {
        return { status: 1, stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
    request: async () => {
      throw new Error("ci must not be loaded when the SHA is off main");
    },
    repository: "Audiolad/audiolad",
    token: "t",
    originMainSha: MAIN,
    commitSha: MERGE,
  });
  assert.equal(ancestorFacts.isAncestor, false);
  assert.equal(ancestorCalls.some((call) => call.includes("fetch")), false);
}

function gitEnv(store, args) {
  const result = spawnSync("git", ["-C", store, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Bridge Test",
      GIT_AUTHOR_EMAIL: "bridge@example.com",
      GIT_COMMITTER_NAME: "Bridge Test",
      GIT_COMMITTER_EMAIL: "bridge@example.com",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function testRealMergeCommitUsesHeadCiOnlyWhenTreesMatch() {
  const store = mkdtempSync(join(tmpdir(), "audiolad-bridge-"));
  try {
    gitEnv(store, ["init", "-b", "main"]);
    writeFileSync(join(store, "a.txt"), "a\n");
    gitEnv(store, ["add", "a.txt"]);
    gitEnv(store, ["commit", "-m", "base"]);
    const base = gitEnv(store, ["rev-parse", "HEAD"]);
    gitEnv(store, ["checkout", "-b", "pr"]);
    writeFileSync(join(store, "b.txt"), "b\n");
    gitEnv(store, ["add", "b.txt"]);
    gitEnv(store, ["commit", "-m", "head"]);
    const head = gitEnv(store, ["rev-parse", "HEAD"]);
    gitEnv(store, ["checkout", "main"]);
    gitEnv(store, ["merge", "--no-ff", "-m", "merge", "pr"]);
    const merge = gitEnv(store, ["rev-parse", "HEAD"]);

    const requests = [];
    const facts = await loadGateFacts({
      git: (args) => {
        const result = spawnSync("git", ["-C", store, ...args], { encoding: "utf8" });
        return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
      },
      request: async (url) => {
        requests.push(url);
        if (url.includes("/check-runs")) {
          const subject = url.includes(head) ? greenChecks() : [];
          return jsonResponse({ total_count: subject.length, check_runs: subject });
        }
        const statuses = url.includes(head) ? greenStatuses() : [];
        return jsonResponse({ statuses });
      },
      repository: "Audiolad/audiolad",
      token: "t",
      originMainSha: merge,
      commitSha: merge,
    });
    const decision = evaluateGate(facts);
    assert.equal(decision.ok, true, decision.error);
    assert.equal(decision.ciSubjectSha, head);
    assert.equal(requests.every((url) => url.includes(merge) || url.includes(head)), true);
    assert.equal(requests.some((url) => url.includes(base)), false);

    gitEnv(store, ["checkout", "-b", "feature", base]);
    writeFileSync(join(store, "d.txt"), "d\n");
    gitEnv(store, ["add", "d.txt"]);
    gitEnv(store, ["commit", "-m", "feature"]);
    const feature = gitEnv(store, ["rev-parse", "HEAD"]);
    gitEnv(store, ["checkout", "main"]);
    writeFileSync(join(store, "c.txt"), "c\n");
    gitEnv(store, ["add", "c.txt"]);
    gitEnv(store, ["commit", "-m", "main moved"]);
    gitEnv(store, ["merge", "--no-ff", "-m", "diverged", "feature"]);
    const diverged = gitEnv(store, ["rev-parse", "HEAD"]);
    const divergedFacts = await loadGateFacts({
      git: (args) => {
        const result = spawnSync("git", ["-C", store, ...args], { encoding: "utf8" });
        return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
      },
      request: async (url) => {
        if (url.includes("/check-runs")) {
          const subject = url.includes(feature) ? greenChecks() : [];
          return jsonResponse({ total_count: subject.length, check_runs: subject });
        }
        const statuses = url.includes(feature) ? greenStatuses() : [];
        return jsonResponse({ statuses });
      },
      repository: "Audiolad/audiolad",
      token: "t",
      originMainSha: diverged,
      commitSha: diverged,
    });
    assert.equal(evaluateGate(divergedFacts).error, "tree_mismatch");
  } finally {
    rmSync(store, { recursive: true, force: true });
  }
}

function cliEnv(overrides) {
  return {
    ...process.env,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR: "oriy",
    GITHUB_RUN_ID: "99",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "Audiolad/audiolad",
    GITHUB_REF: "refs/heads/main",
    TARGET_SHA: MERGE,
    ORIGIN_MAIN_SHA: MAIN,
    CI_SUBJECT_SHA: HEAD,
    STARTED_AT: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

function testCliCompleteAndHealth() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-bridge-cli-"));
  try {
    const healthFile = join(dir, "health.json");
    const stdoutFile = join(dir, "stdout.txt");
    const resultFile = join(dir, "result.json");
    writeFileSync(stdoutFile, "deploy_succeeded\n");
    writeFileSync(healthFile, JSON.stringify({ ok: true }));
    const ok = spawnSync(process.execPath, [policyPath, "complete"], {
      encoding: "utf8",
      env: cliEnv({
        HEALTH_FILE: healthFile,
        DEPLOY_STDOUT_FILE: stdoutFile,
        DEPLOY_EXIT_CODE: "0",
        RESULT_FILE: resultFile,
      }),
    });
    assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
    assert.equal(JSON.parse(ok.stdout).state, "succeeded");

    writeFileSync(stdoutFile, "rollback_succeeded target=previous\n");
    const rolled = spawnSync(process.execPath, [policyPath, "complete"], {
      encoding: "utf8",
      env: cliEnv({
        HEALTH_FILE: healthFile,
        DEPLOY_STDOUT_FILE: stdoutFile,
        DEPLOY_EXIT_CODE: "1",
        RESULT_FILE: resultFile,
      }),
    });
    assert.equal(rolled.status, 1);
    assert.equal(JSON.parse(rolled.stdout).state, "rolled_back");

    const forced = spawnSync(process.execPath, [policyPath, "complete"], {
      encoding: "utf8",
      env: cliEnv({
        BRIDGE_FORCE_ERROR: "ancestry_lost",
        DEPLOY_EXIT_CODE: "0",
        RESULT_FILE: resultFile,
      }),
    });
    assert.equal(forced.status, 1);
    const forcedBody = JSON.parse(forced.stdout);
    assert.equal(forcedBody.state, "failed");
    assert.equal(forcedBody.error, "ancestry_lost");

    const buildFile = join(dir, "build.json");
    const depsFile = join(dir, "deps.json");
    writeFileSync(buildFile, JSON.stringify({ status: "ok", deployCommit: HEAD }));
    writeFileSync(depsFile, JSON.stringify({ status: "ok", database: "ok" }));
    const health = spawnSync(process.execPath, [policyPath, "health"], {
      encoding: "utf8",
      env: cliEnv({
        HOMEPAGE_STATUS: "404",
        BUILD_STATUS: "200",
        DEPS_STATUS: "200",
        BUILD_FILE: buildFile,
        DEPS_FILE: depsFile,
        HEALTH_FILE: healthFile,
      }),
    });
    assert.equal(health.status, 1);
    assert.equal(JSON.parse(readFileSync(healthFile, "utf8")).error, "health_homepage_failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testWorkflowContract() {
  const workflowText = readFileSync(workflowPath, "utf8");
  const workflow = parseWorkflow(workflowText);
  assert.deepEqual(Object.keys(workflow.on).sort(), ["repository_dispatch", "workflow_dispatch"]);
  assert.deepEqual(workflow.on.repository_dispatch.types, ["deployment-bridge"]);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ["commit_sha"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.commit_sha.required, true);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.pull_request, undefined);
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.equal(workflow.on.schedule, undefined);
  assert.equal(workflow.on.workflow_call, undefined);

  assert.deepEqual(workflow.permissions, {
    contents: "read",
    checks: "write",
    statuses: "write",
  });
  assert.equal(workflow.concurrency.group, "production-deploy");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);

  assert.equal(workflow.jobs.deploy.environment, "production");
  assert.equal(workflow.jobs.gate.environment, undefined);
  assert.equal(workflow.jobs["refuse-non-main"].environment, undefined);
  assert.deepEqual(workflow.jobs.deploy.needs, ["gate"]);
  assert.match(workflowText, /if: github\.ref != 'refs\/heads\/main'/);
  assert.match(workflowText, /needs\.gate\.result == 'success'/);

  const executableWorkflow = workflowText
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.equal(executableWorkflow.split("sudo -n /usr/local/sbin/audiolad-deploy").length - 1, 1);
  assert.match(workflowText, new RegExp(REMOTE_DEPLOY_COMMAND.join(" ")));
  assert.equal(workflowText.split("ssh \\").length - 1, 1);
  assert.match(workflowText, /StrictHostKeyChecking=yes/);
  assert.doesNotMatch(workflowText, /StrictHostKeyChecking=no/);
  assert.doesNotMatch(workflowText, /bash -s/);
  assert.doesNotMatch(workflowText, /AUDIOLAD_DEPLOY_OVERRIDE/);
  assert.doesNotMatch(workflowText, /actions\/checkout/);
  assert.doesNotMatch(workflowText, /git reset --hard/);
  assert.doesNotMatch(workflowText, /show "\$\{TARGET_SHA\}:/);
  assert.match(workflowText, /show "\$\{ORIGIN_MAIN_SHA\}:scripts\/deployment-bridge-policy\.mjs"/);
  assert.match(workflowText, /show "\$\{FRESH_MAIN\}:scripts\/deployment-bridge-policy\.mjs"/);
  assert.match(workflowText, new RegExp(HOMEPAGE_URL.replaceAll("/", "\\/")));
  assert.match(workflowText, new RegExp(HEALTH_BUILD_URL.replaceAll("/", "\\/")));
  assert.match(workflowText, new RegExp(HEALTH_DEPENDENCIES_URL.replaceAll("/", "\\/")));
  assert.match(workflowText, /fetch --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main/);
  assert.doesNotMatch(workflowText, /refs\/pull/);

  const docs = readFileSync(docsPath, "utf8");
  assert.match(docs, /state=rolled_back/);
  assert.match(docs, /repository_dispatch/);
  assert.match(docs, /PR Repository Validation/);
  assert.match(docs, /Production \/ PR Safety/);
  assert.match(docs, /Production \/ PR Safety Runner/);
  assert.match(docs, /sudo -n \/usr\/local\/sbin\/audiolad-deploy/);
  const ignoredChecks = new Set(IGNORED_EVIDENCE_CHECK_NAMES);
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(typeof job.name, "string");
    assert.equal(ignoredChecks.has(job.name), true, job.name);
    assert.match(docs, new RegExp(job.name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(ignoredChecks.has(REQUIRED_CHECK_NAME), false);
  assert.equal(ignoredChecks.has("Production / PR Safety Runner"), true);
  assert.match(docs, /не деплоит/);
}

async function main() {
  testSelectCommitSha();
  testGateAllowsEqualTreeMerge();
  testGateAllowsCiOnTheDeployShaItself();
  testGateRejectsOffMainAndBadShapes();
  testGateRejectsTreeMismatchAndRedCi();
  testGateAcceptsTwoParentMergeAfterBridgeAndRunnerNoise();
  testHealthAndClassification();
  await testPublication();
  await testLoadGateFactsDoesNotFetchCiOffMain();
  await testRealMergeCommitUsesHeadCiOnlyWhenTreesMatch();
  testCliCompleteAndHealth();
  testWorkflowContract();
  console.log("deployment-bridge-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
