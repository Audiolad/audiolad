/**
 * Deployment Bridge gate. Pure decisions live here so CI can test them
 * without SSH, production, or a GitHub token.
 *
 * The only production command this bridge is allowed to justify is:
 *   sudo -n /usr/local/sbin/audiolad-deploy <40-char-lowercase-hex-sha>
 * That wrapper already refuses anything that is not an ancestor of origin/main.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const RESULT_SCHEMA = "audiolad.deployment_bridge.v1";
export const BRIDGE_STATUS_CONTEXT = "Deployment Bridge";
export const REQUIRED_CHECK_NAME = "PR Repository Validation";
export const REQUIRED_STATUS_CONTEXT = "Production / PR Safety";
// Ignored by subjectEvidence. Required evidence is still REQUIRED_CHECK_NAME
// and REQUIRED_STATUS_CONTEXT. Job names match deployment-bridge.yml.
export const IGNORED_EVIDENCE_CHECK_NAMES = Object.freeze([
  BRIDGE_STATUS_CONTEXT,
  "Refuse dispatch outside main",
  "Gate commit",
  "Deploy pinned SHA",
  "Production / PR Safety Runner",
]);
export const BRIDGE_STATES = Object.freeze([
  "queued",
  "running",
  "succeeded",
  "failed",
  "rolled_back",
]);
export const REMOTE_DEPLOY_COMMAND = Object.freeze([
  "sudo",
  "-n",
  "/usr/local/sbin/audiolad-deploy",
]);
export const PRODUCTION_ORIGIN = "https://audiolad.ru";
export const HEALTH_BUILD_URL = `${PRODUCTION_ORIGIN}/api/health/build`;
export const HEALTH_DEPENDENCIES_URL = `${PRODUCTION_ORIGIN}/api/health/dependencies`;
export const HOMEPAGE_URL = `${PRODUCTION_ORIGIN}/`;

const SHA40 = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ALLOWED_CHECK_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);
const BLOCKING_STATUS_STATES = new Set(["pending", "failure", "error"]);

export function assertCommitSha(value) {
  if (typeof value !== "string") {
    throw new Error("invalid_commit_sha");
  }
  const trimmed = value.trim();
  if (!SHA40.test(trimmed)) {
    throw new Error("invalid_commit_sha");
  }
  return trimmed;
}

function assertTreeSha(value) {
  if (typeof value !== "string" || !SHA40.test(value)) {
    throw new Error("invalid_tree_sha");
  }
  return value;
}

export function assertRepository(value) {
  if (typeof value !== "string" || !REPOSITORY.test(value)) {
    throw new Error("invalid_repository");
  }
  return value;
}

export function selectCommitSha({ eventName, inputCommitSha, clientPayload }) {
  if (eventName === "workflow_dispatch") {
    if (clientPayload != null && clientPayload !== "") {
      return { ok: false, error: "unexpected_payload" };
    }
    try {
      return { ok: true, commitSha: assertCommitSha(inputCommitSha ?? "") };
    } catch {
      return { ok: false, error: "invalid_commit_sha" };
    }
  }

  if (eventName === "repository_dispatch") {
    if (typeof inputCommitSha === "string" && inputCommitSha.trim() !== "") {
      return { ok: false, error: "unexpected_payload" };
    }
    if (clientPayload == null || typeof clientPayload !== "object" || Array.isArray(clientPayload)) {
      return { ok: false, error: "unexpected_payload" };
    }
    const keys = Object.keys(clientPayload);
    if (keys.length !== 1 || keys[0] !== "commit_sha") {
      return { ok: false, error: "unexpected_payload" };
    }
    try {
      return { ok: true, commitSha: assertCommitSha(clientPayload.commit_sha) };
    } catch {
      return { ok: false, error: "invalid_commit_sha" };
    }
  }

  return { ok: false, error: "unsupported_event" };
}

const IGNORED_EVIDENCE_CHECK_NAME_SET = new Set(IGNORED_EVIDENCE_CHECK_NAMES);

function isIgnoredEvidenceCheck(run) {
  return IGNORED_EVIDENCE_CHECK_NAME_SET.has(run?.name);
}

function eventTime(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function latestByName(checks) {
  const byName = new Map();
  for (const run of checks) {
    const previous = byName.get(run.name);
    const currentTime = eventTime(run.completed_at || run.started_at);
    const previousTime = previous ? eventTime(previous.completed_at || previous.started_at) : -1;
    if (!previous || currentTime > previousTime) {
      byName.set(run.name, run);
    }
  }
  return [...byName.values()];
}

function latestByContext(statuses) {
  const byContext = new Map();
  for (const status of statuses) {
    const previous = byContext.get(status.context);
    if (!previous || eventTime(status.updated_at) > eventTime(previous.updated_at)) {
      byContext.set(status.context, status);
    }
  }
  return [...byContext.values()];
}

function subjectEvidence(checks, statuses) {
  const namedChecks = [];
  for (const run of checks ?? []) {
    if (isIgnoredEvidenceCheck(run)) {
      continue;
    }
    if (typeof run?.name !== "string" || run.name.length === 0) {
      return { clean: false, required: false, error: "ci_malformed" };
    }
    namedChecks.push(run);
  }
  const relevantChecks = latestByName(namedChecks);
  for (const run of relevantChecks) {
    if (run.status !== "completed") {
      return { clean: false, required: false, error: "ci_pending" };
    }
    if (!ALLOWED_CHECK_CONCLUSIONS.has(run.conclusion)) {
      return { clean: false, required: false, error: "ci_not_green" };
    }
  }

  const namedStatuses = [];
  for (const status of statuses ?? []) {
    if (status?.context === BRIDGE_STATUS_CONTEXT) {
      continue;
    }
    if (typeof status?.context !== "string" || status.context.length === 0) {
      return { clean: false, required: false, error: "ci_malformed" };
    }
    namedStatuses.push(status);
  }
  const relevantStatuses = latestByContext(namedStatuses);
  for (const status of relevantStatuses) {
    if (BLOCKING_STATUS_STATES.has(status.state)) {
      return { clean: false, required: false, error: "ci_not_green" };
    }
    if (status.state !== "success") {
      return { clean: false, required: false, error: "ci_malformed" };
    }
  }

  const validation = relevantChecks.filter((run) => run.name === REQUIRED_CHECK_NAME);
  const safety = relevantStatuses.filter((status) => status.context === REQUIRED_STATUS_CONTEXT);
  const required =
    validation.length > 0 &&
    validation.every((run) => run.conclusion === "success") &&
    safety.length > 0 &&
    safety.every((status) => status.state === "success");

  return { clean: true, required, error: null };
}

export function evaluateGate(facts) {
  let requestedSha;
  let originMainSha;
  try {
    requestedSha = assertCommitSha(facts.requestedSha);
    originMainSha = assertCommitSha(facts.originMainSha);
  } catch {
    return { ok: false, error: "invalid_commit_sha" };
  }

  if (facts.isCommit !== true) {
    return { ok: false, error: "not_on_main", deploySha: requestedSha, originMainSha };
  }
  if (facts.isAncestor !== true) {
    return { ok: false, error: "not_on_main", deploySha: requestedSha, originMainSha };
  }

  const parents = Array.isArray(facts.parents) ? facts.parents : null;
  if (parents == null) {
    return { ok: false, error: "ci_malformed", deploySha: requestedSha, originMainSha };
  }
  let normalizedParents;
  try {
    normalizedParents = parents.map((parent) => assertCommitSha(parent));
  } catch {
    return { ok: false, error: "ci_malformed", deploySha: requestedSha, originMainSha };
  }
  if (normalizedParents.length > 2) {
    return { ok: false, error: "unsupported_merge_shape", deploySha: requestedSha, originMainSha };
  }

  const deployTree = facts.trees?.[requestedSha];
  try {
    assertTreeSha(deployTree);
  } catch {
    return { ok: false, error: "ci_malformed", deploySha: requestedSha, originMainSha };
  }

  const candidates = [{ sha: requestedSha, treeEqual: true }];
  if (normalizedParents.length === 2) {
    const headSha = normalizedParents[1];
    const headTree = facts.trees?.[headSha];
    try {
      assertTreeSha(headTree);
    } catch {
      return { ok: false, error: "ci_malformed", deploySha: requestedSha, originMainSha };
    }
    if (headTree === deployTree) {
      candidates.push({ sha: headSha, treeEqual: true });
    }
  }

  const deployEvidence = subjectEvidence(facts.checks?.[requestedSha], facts.statuses?.[requestedSha]);
  if (!deployEvidence.clean) {
    return {
      ok: false,
      error: deployEvidence.error,
      deploySha: requestedSha,
      originMainSha,
    };
  }

  let headEvidence = null;
  if (candidates.length === 2) {
    const headSha = candidates[1].sha;
    headEvidence = subjectEvidence(facts.checks?.[headSha], facts.statuses?.[headSha]);
    if (!headEvidence.clean) {
      return {
        ok: false,
        error: headEvidence.error,
        deploySha: requestedSha,
        originMainSha,
      };
    }
  }

  if (deployEvidence.required) {
    return {
      ok: true,
      deploySha: requestedSha,
      ciSubjectSha: requestedSha,
      originMainSha,
    };
  }
  if (headEvidence?.required) {
    return {
      ok: true,
      deploySha: requestedSha,
      ciSubjectSha: candidates[1].sha,
      originMainSha,
    };
  }

  if (normalizedParents.length === 2 && candidates.length === 1) {
    return {
      ok: false,
      error: "tree_mismatch",
      deploySha: requestedSha,
      originMainSha,
    };
  }

  // Squash and other single-parent commits have no second parent. If the
  // deploy SHA itself has no usable required evidence, a tree-identical
  // merged PR head may supply it. Two-parent merges never use this path.
  // A green deploy SHA already returned above, so a twin cannot veto it.
  if (normalizedParents.length < 2 && facts.treeTwinSha != null && facts.treeTwinSha !== "") {
    let twinSha;
    try {
      twinSha = assertCommitSha(facts.treeTwinSha);
    } catch {
      return { ok: false, error: "ci_malformed", deploySha: requestedSha, originMainSha };
    }
    if (twinSha === requestedSha) {
      return { ok: false, error: "ci_malformed", deploySha: requestedSha, originMainSha };
    }
    const twinTree = facts.trees?.[twinSha];
    try {
      assertTreeSha(twinTree);
    } catch {
      return { ok: false, error: "ci_malformed", deploySha: requestedSha, originMainSha };
    }
    if (twinTree !== deployTree) {
      return {
        ok: false,
        error: "tree_mismatch",
        deploySha: requestedSha,
        originMainSha,
      };
    }
    const twinEvidence = subjectEvidence(facts.checks?.[twinSha], facts.statuses?.[twinSha]);
    if (!twinEvidence.clean) {
      return {
        ok: false,
        error: twinEvidence.error,
        deploySha: requestedSha,
        originMainSha,
      };
    }
    if (twinEvidence.required) {
      return {
        ok: true,
        deploySha: requestedSha,
        ciSubjectSha: twinSha,
        originMainSha,
      };
    }
  }

  return {
    ok: false,
    error: "ci_not_green",
    deploySha: requestedSha,
    originMainSha,
  };
}

export function evaluateHealth({
  expectedSha,
  homepageStatus,
  buildStatus,
  buildBody,
  dependenciesStatus,
  dependenciesBody,
}) {
  let sha;
  try {
    sha = assertCommitSha(expectedSha);
  } catch {
    return { ok: false, error: "invalid_commit_sha" };
  }

  const homepageOk = homepageStatus === 200;
  const buildCommit =
    typeof buildBody?.deployCommit === "string" ? buildBody.deployCommit.trim().toLowerCase() : null;
  const buildOk =
    buildStatus === 200 && buildBody?.status === "ok" && buildCommit === sha;
  const dependenciesOk =
    dependenciesStatus === 200 &&
    dependenciesBody?.status === "ok" &&
    dependenciesBody?.database === "ok";

  let error = null;
  if (!homepageOk) {
    error = "health_homepage_failed";
  } else if (!buildOk) {
    error = "health_build_failed";
  } else if (!dependenciesOk) {
    error = "health_dependencies_failed";
  }

  return {
    ok: error == null,
    error,
    homepage: {
      url: HOMEPAGE_URL,
      http_status: homepageStatus ?? null,
      ok: homepageOk,
    },
    build: {
      url: HEALTH_BUILD_URL,
      http_status: buildStatus ?? null,
      status: typeof buildBody?.status === "string" ? buildBody.status : null,
      deploy_commit: buildCommit,
      ok: buildOk,
    },
    dependencies: {
      url: HEALTH_DEPENDENCIES_URL,
      http_status: dependenciesStatus ?? null,
      status: typeof dependenciesBody?.status === "string" ? dependenciesBody.status : null,
      database: typeof dependenciesBody?.database === "string" ? dependenciesBody.database : null,
      ok: dependenciesOk,
    },
  };
}

export function classifyOutcome({ deployExitCode, deployStdout, health }) {
  const text = typeof deployStdout === "string" ? deployStdout : "";
  const sawRollback = text.includes("rollback_succeeded");
  const sawRollbackFailure = text.includes("rollback_failed");
  const exitCode = Number(deployExitCode);

  if (!Number.isInteger(exitCode)) {
    return { state: "failed", rollback: "not_invoked", error: "deploy_failed" };
  }

  if (exitCode === 0) {
    if (sawRollback || sawRollbackFailure || health?.ok !== true) {
      return {
        state: "failed",
        rollback: "not_invoked",
        error: health?.ok === true ? "unexpected_rollback_marker" : "health_failed",
      };
    }
    return { state: "succeeded", rollback: "not_invoked", error: null };
  }

  if (sawRollback && !sawRollbackFailure) {
    return { state: "rolled_back", rollback: "detected", error: "rolled_back" };
  }

  return { state: "failed", rollback: "not_detected", error: "deploy_failed" };
}

export function githubPublication(bridgeState) {
  if (!BRIDGE_STATES.includes(bridgeState)) {
    throw new Error("invalid_bridge_state");
  }
  if (bridgeState === "queued") {
    return {
      commitState: "pending",
      checkStatus: "queued",
      checkConclusion: null,
      description: "state=queued",
    };
  }
  if (bridgeState === "running") {
    return {
      commitState: "pending",
      checkStatus: "in_progress",
      checkConclusion: null,
      description: "state=running",
    };
  }
  if (bridgeState === "succeeded") {
    return {
      commitState: "success",
      checkStatus: "completed",
      checkConclusion: "success",
      description: "state=succeeded",
    };
  }
  return {
    commitState: "failure",
    checkStatus: "completed",
    checkConclusion: "failure",
    description: `state=${bridgeState}`,
  };
}

export function buildResult(input) {
  if (!BRIDGE_STATES.includes(input.state)) {
    throw new Error("invalid_bridge_state");
  }
  const commitSha = input.commitSha == null ? null : assertCommitSha(input.commitSha);
  const originMainSha = input.originMainSha == null ? null : assertCommitSha(input.originMainSha);
  const ciSubjectSha = input.ciSubjectSha == null ? null : assertCommitSha(input.ciSubjectSha);
  if (typeof input.initiator !== "string" || input.initiator.length === 0 || input.initiator.length > 128) {
    throw new Error("invalid_initiator");
  }
  if (input.eventName !== "workflow_dispatch" && input.eventName !== "repository_dispatch") {
    throw new Error("unsupported_event");
  }
  if (!/^[0-9]+$/.test(String(input.runId))) {
    throw new Error("invalid_run_id");
  }
  if (typeof input.runUrl !== "string" || !input.runUrl.startsWith("https://")) {
    throw new Error("invalid_run_url");
  }
  if (typeof input.startedAt !== "string" || Number.isNaN(Date.parse(input.startedAt))) {
    throw new Error("invalid_started_at");
  }
  if (input.finishedAt != null && Number.isNaN(Date.parse(input.finishedAt))) {
    throw new Error("invalid_finished_at");
  }
  if (!["not_invoked", "detected", "not_detected"].includes(input.rollback)) {
    throw new Error("invalid_rollback");
  }

  return {
    schema: RESULT_SCHEMA,
    state: input.state,
    commit_sha: commitSha,
    origin_main_sha: originMainSha,
    ci_subject_sha: ciSubjectSha,
    initiator: input.initiator,
    event_name: input.eventName,
    run_id: String(input.runId),
    run_url: input.runUrl,
    started_at: input.startedAt,
    finished_at: input.finishedAt ?? null,
    health: input.health ?? null,
    rollback: input.rollback,
    error: input.error ?? null,
  };
}

export async function publishDeploymentResult({
  request,
  token,
  repository,
  result,
}) {
  assertRepository(repository);
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("missing_token");
  }
  const sha = result.commit_sha;
  assertCommitSha(sha);
  const publication = githubPublication(result.state);
  if (publication.description !== `state=${result.state}`) {
    throw new Error("invalid_bridge_state");
  }
  if (result.schema !== RESULT_SCHEMA) {
    throw new Error("invalid_result");
  }

  const summary = JSON.stringify(result);
  const statusBody = {
    state: publication.commitState,
    context: BRIDGE_STATUS_CONTEXT,
    description: publication.description,
    target_url: result.run_url,
  };
  if (statusBody.context !== BRIDGE_STATUS_CONTEXT) {
    throw new Error("refusing_status_context");
  }

  const checkBody = {
    name: BRIDGE_STATUS_CONTEXT,
    head_sha: sha,
    status: publication.checkStatus,
    details_url: result.run_url,
    external_id: result.run_id,
    output: {
      title: `Deployment Bridge ${result.state}`,
      summary,
    },
  };
  if (publication.checkConclusion) {
    checkBody.conclusion = publication.checkConclusion;
  }
  if (checkBody.name !== BRIDGE_STATUS_CONTEXT) {
    throw new Error("refusing_check_name");
  }

  await githubRequest(request, {
    token,
    method: "POST",
    path: `/repos/${repository}/statuses/${sha}`,
    body: statusBody,
  });
  await githubRequest(request, {
    token,
    method: "POST",
    path: `/repos/${repository}/check-runs`,
    body: checkBody,
  });

  return { statusBody, checkBody };
}

async function githubRequest(request, { token, method, path, body }) {
  const response = await request(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "audiolad-deployment-bridge",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!response.ok) {
    throw new Error(`github_api_${response.status}`);
  }
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function normalizeChecks(payload) {
  const runs = payload?.check_runs;
  if (!Array.isArray(runs)) {
    throw new Error("ci_malformed");
  }
  if (typeof payload.total_count === "number" && payload.total_count > runs.length) {
    throw new Error("ci_truncated");
  }
  return runs.map((run) => ({
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    started_at: run.started_at,
    completed_at: run.completed_at,
  }));
}

function normalizeStatuses(payload) {
  const statuses = payload?.statuses;
  if (!Array.isArray(statuses)) {
    throw new Error("ci_malformed");
  }
  return statuses.map((status) => ({
    context: status.context,
    state: status.state,
    updated_at: status.updated_at,
  }));
}

function normalizeListedSha(value) {
  return assertCommitSha(String(value ?? "").trim().toLowerCase());
}

// Head of the PR whose merge_commit_sha is exactly the deploy SHA.
// Other associated PRs are ignored. Ambiguous or truncated lists fail closed.
export function selectTreeTwinSha(pulls, deploySha) {
  const normalizedDeploy = assertCommitSha(deploySha);
  if (!Array.isArray(pulls)) {
    throw new Error("ci_malformed");
  }
  if (pulls.length >= 100) {
    throw new Error("ci_truncated");
  }
  const heads = [];
  for (const pr of pulls) {
    if (pr == null || typeof pr !== "object" || Array.isArray(pr)) {
      throw new Error("ci_malformed");
    }
    const rawMerge = pr.merge_commit_sha;
    if (rawMerge == null || rawMerge === "") {
      continue;
    }
    let mergeSha;
    try {
      mergeSha = normalizeListedSha(rawMerge);
    } catch {
      throw new Error("ci_malformed");
    }
    if (mergeSha !== normalizedDeploy) {
      continue;
    }
    const rawHead = pr.head && typeof pr.head === "object" ? pr.head.sha : null;
    let headSha;
    try {
      headSha = normalizeListedSha(rawHead);
    } catch {
      throw new Error("ci_malformed");
    }
    if (headSha === normalizedDeploy) {
      throw new Error("ci_malformed");
    }
    if (!heads.includes(headSha)) {
      heads.push(headSha);
    }
  }
  if (heads.length > 1) {
    throw new Error("ci_malformed");
  }
  return heads[0] ?? null;
}

function commitTreeSha(payload, expectedSha) {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("ci_malformed");
  }
  let sha;
  try {
    sha = normalizeListedSha(payload.sha);
  } catch {
    throw new Error("ci_malformed");
  }
  if (sha !== expectedSha) {
    throw new Error("ci_malformed");
  }
  try {
    return assertTreeSha(String(payload.commit?.tree?.sha ?? "").trim().toLowerCase());
  } catch {
    throw new Error("ci_malformed");
  }
}

async function discoverTreeTwin(deps, deploySha) {
  const repository = assertRepository(deps.repository);
  const pulls = await githubRequest(deps.request, {
    token: deps.token,
    method: "GET",
    path: `/repos/${repository}/commits/${deploySha}/pulls?per_page=100`,
  });
  const headSha = selectTreeTwinSha(pulls, deploySha);
  if (headSha == null) {
    return null;
  }
  const commitPayload = await githubRequest(deps.request, {
    token: deps.token,
    method: "GET",
    path: `/repos/${repository}/commits/${headSha}`,
  });
  return { sha: headSha, tree: commitTreeSha(commitPayload, headSha) };
}

async function loadCi(deps, sha) {
  assertCommitSha(sha);
  const repository = assertRepository(deps.repository);
  const checksPayload = await githubRequest(deps.request, {
    token: deps.token,
    method: "GET",
    path: `/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
  });
  const statusPayload = await githubRequest(deps.request, {
    token: deps.token,
    method: "GET",
    path: `/repos/${repository}/commits/${sha}/status`,
  });
  return {
    checks: normalizeChecks(checksPayload),
    statuses: normalizeStatuses(statusPayload),
  };
}

export async function loadGateFacts(deps) {
  const commitSha = assertCommitSha(deps.commitSha);
  const originMainSha = assertCommitSha(deps.originMainSha);
  const cat = deps.git(["cat-file", "-e", `${commitSha}^{commit}`]);
  if (cat.status !== 0) {
    return {
      requestedSha: commitSha,
      originMainSha,
      isCommit: false,
      isAncestor: false,
      parents: [],
      trees: {},
      checks: {},
      statuses: {},
    };
  }

  const ancestor = deps.git(["merge-base", "--is-ancestor", commitSha, originMainSha]);
  if (ancestor.status !== 0) {
    return {
      requestedSha: commitSha,
      originMainSha,
      isCommit: true,
      isAncestor: false,
      parents: [],
      trees: {},
      checks: {},
      statuses: {},
    };
  }

  const listed = deps.git(["rev-list", "--parents", "-n", "1", commitSha]);
  if (listed.status !== 0) {
    throw new Error("git_parents_failed");
  }
  const parts = listed.stdout.trim().split(/\s+/).filter(Boolean);
  if (parts[0] !== commitSha) {
    throw new Error("git_parents_failed");
  }
  const parents = parts.slice(1).map((parent) => assertCommitSha(parent));
  const treeResult = deps.git(["rev-parse", `${commitSha}^{tree}`]);
  if (treeResult.status !== 0) {
    throw new Error("git_tree_failed");
  }
  const trees = {
    [commitSha]: assertTreeSha(treeResult.stdout.trim()),
  };

  if (parents.length === 2) {
    const headTree = deps.git(["rev-parse", `${parents[1]}^{tree}`]);
    if (headTree.status !== 0) {
      throw new Error("git_tree_failed");
    }
    trees[parents[1]] = assertTreeSha(headTree.stdout.trim());
  } else if (parents.length > 2) {
    return {
      requestedSha: commitSha,
      originMainSha,
      isCommit: true,
      isAncestor: true,
      parents,
      trees,
      checks: {},
      statuses: {},
    };
  }

  const checks = {};
  const statuses = {};
  const deployCi = await loadCi(deps, commitSha);
  checks[commitSha] = deployCi.checks;
  statuses[commitSha] = deployCi.statuses;
  if (parents.length === 2) {
    const headCi = await loadCi(deps, parents[1]);
    checks[parents[1]] = headCi.checks;
    statuses[parents[1]] = headCi.statuses;
  }

  let treeTwinSha = null;
  if (parents.length < 2) {
    const deployEvidence = subjectEvidence(checks[commitSha], statuses[commitSha]);
    if (deployEvidence.clean && !deployEvidence.required) {
      const twin = await discoverTreeTwin(deps, commitSha);
      if (twin) {
        trees[twin.sha] = twin.tree;
        treeTwinSha = twin.sha;
        if (twin.tree === trees[commitSha]) {
          const twinCi = await loadCi(deps, twin.sha);
          checks[twin.sha] = twinCi.checks;
          statuses[twin.sha] = twinCi.statuses;
        }
      }
    }
  }

  return {
    requestedSha: commitSha,
    originMainSha,
    isCommit: true,
    isAncestor: true,
    parents,
    trees,
    treeTwinSha,
    checks,
    statuses,
  };
}

function gitRunner(objectStore, args) {
  const result = spawnSync("git", ["-C", objectStore, ...args], { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function writeOutput(key, value) {
  if (!/^[a-z0-9_]+$/.test(key) || /[\r\n]/.test(String(value))) {
    throw new Error("invalid_output");
  }
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    return;
  }
  appendFileSync(file, `${key}=${value}\n`);
}

function runUrl() {
  return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
}

function resultBase(commitSha, extra) {
  return buildResult({
    state: extra.state,
    commitSha,
    originMainSha: extra.originMainSha ?? null,
    ciSubjectSha: extra.ciSubjectSha ?? null,
    initiator: process.env.GITHUB_ACTOR || "unknown",
    eventName: process.env.GITHUB_EVENT_NAME,
    runId: process.env.GITHUB_RUN_ID,
    runUrl: runUrl(),
    startedAt: extra.startedAt,
    finishedAt: extra.finishedAt ?? null,
    health: extra.health ?? null,
    rollback: extra.rollback,
    error: extra.error ?? null,
  });
}

async function publishOrThrow(result) {
  await publishDeploymentResult({
    request: globalThis.fetch,
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    result,
  });
}

function readJsonEnv(name) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return null;
  }
  return JSON.parse(raw);
}

async function commandGate() {
  if (process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("refused_not_main");
  }
  const startedAt = new Date().toISOString();
  const selected = selectCommitSha({
    eventName: process.env.GITHUB_EVENT_NAME,
    inputCommitSha: process.env.INPUT_COMMIT_SHA ?? "",
    clientPayload: readJsonEnv("CLIENT_PAYLOAD_JSON"),
  });
  if (!selected.ok) {
    console.error(selected.error);
    process.exitCode = 1;
    return;
  }

  let facts;
  try {
    facts = await loadGateFacts({
      git: (args) => gitRunner(process.env.OBJECT_STORE, args),
      request: globalThis.fetch,
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      originMainSha: process.env.ORIGIN_MAIN_SHA,
      commitSha: selected.commitSha,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ci_malformed";
    const failed = resultBase(selected.commitSha, {
      state: "failed",
      originMainSha: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      rollback: "not_invoked",
      error: /^[a-z0-9_]+$/.test(code) ? code : "ci_malformed",
    });
    try {
      await publishOrThrow(failed);
    } catch (publishError) {
      console.error(publishError instanceof Error ? publishError.message : "publish_failed");
    }
    console.error(code);
    process.exitCode = 1;
    return;
  }
  const decision = evaluateGate(facts);
  if (!decision.ok) {
    const failed = resultBase(selected.commitSha, {
      state: "failed",
      originMainSha: facts.isAncestor ? facts.originMainSha : null,
      startedAt,
      finishedAt: new Date().toISOString(),
      rollback: "not_invoked",
      error: decision.error,
    });
    try {
      await publishOrThrow(failed);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "publish_failed");
    }
    console.error(decision.error);
    process.exitCode = 1;
    return;
  }

  const queued = resultBase(decision.deploySha, {
    state: "queued",
    originMainSha: decision.originMainSha,
    ciSubjectSha: decision.ciSubjectSha,
    startedAt,
    rollback: "not_invoked",
    error: null,
  });
  await publishOrThrow(queued);
  writeOutput("target_sha", decision.deploySha);
  writeOutput("origin_main_sha", decision.originMainSha);
  writeOutput("ci_subject_sha", decision.ciSubjectSha);
  writeOutput("started_at", startedAt);
  console.log(
    JSON.stringify({
      state: "queued",
      commit_sha: decision.deploySha,
      ci_subject_sha: decision.ciSubjectSha,
      origin_main_sha: decision.originMainSha,
    }),
  );
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function parseJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function commandHealth() {
  const health = evaluateHealth({
    expectedSha: process.env.TARGET_SHA,
    homepageStatus: Number(process.env.HOMEPAGE_STATUS),
    buildStatus: Number(process.env.BUILD_STATUS),
    buildBody: parseJsonFile(process.env.BUILD_FILE),
    dependenciesStatus: Number(process.env.DEPS_STATUS),
    dependenciesBody: parseJsonFile(process.env.DEPS_FILE),
  });
  writeFileSync(process.env.HEALTH_FILE, `${JSON.stringify(health)}\n`);
  if (!health.ok) {
    process.exitCode = 1;
  }
}

async function commandComplete() {
  const forced = process.env.BRIDGE_FORCE_ERROR ?? "";
  if (forced !== "") {
    if (!/^[a-z0-9_]{1,64}$/.test(forced)) {
      throw new Error("invalid_bridge_state");
    }
    const forcedResult = resultBase(process.env.TARGET_SHA, {
      state: "failed",
      originMainSha: process.env.ORIGIN_MAIN_SHA,
      ciSubjectSha: process.env.CI_SUBJECT_SHA,
      startedAt: process.env.STARTED_AT,
      finishedAt: new Date().toISOString(),
      health: null,
      rollback: "not_invoked",
      error: forced,
    });
    writeFileSync(process.env.RESULT_FILE, `${JSON.stringify(forcedResult)}\n`);
    process.stdout.write(`${JSON.stringify(forcedResult)}\n`);
    process.exitCode = 1;
    return;
  }

  const health = parseJsonFile(process.env.HEALTH_FILE);
  const outcome = classifyOutcome({
    deployExitCode: Number(process.env.DEPLOY_EXIT_CODE),
    deployStdout: readFileSync(process.env.DEPLOY_STDOUT_FILE, "utf8"),
    health,
  });
  const result = resultBase(process.env.TARGET_SHA, {
    state: outcome.state,
    originMainSha: process.env.ORIGIN_MAIN_SHA,
    ciSubjectSha: process.env.CI_SUBJECT_SHA,
    startedAt: process.env.STARTED_AT,
    finishedAt: new Date().toISOString(),
    health,
    rollback: outcome.rollback,
    error: outcome.error,
  });
  writeFileSync(process.env.RESULT_FILE, `${JSON.stringify(result)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.state !== "succeeded") {
    process.exitCode = 1;
  }
}

async function commandRunning() {
  const result = resultBase(process.env.TARGET_SHA, {
    state: "running",
    originMainSha: process.env.ORIGIN_MAIN_SHA,
    ciSubjectSha: process.env.CI_SUBJECT_SHA,
    startedAt: process.env.STARTED_AT,
    rollback: "not_invoked",
    error: null,
  });
  await publishOrThrow(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function commandPublish() {
  const raw = await readStdin();
  const result = JSON.parse(raw);
  buildResult({
    state: result.state,
    commitSha: result.commit_sha,
    originMainSha: result.origin_main_sha,
    ciSubjectSha: result.ci_subject_sha,
    initiator: result.initiator,
    eventName: result.event_name,
    runId: result.run_id,
    runUrl: result.run_url,
    startedAt: result.started_at,
    finishedAt: result.finished_at,
    health: result.health,
    rollback: result.rollback,
    error: result.error,
  });
  await publishOrThrow(result);
  console.log(`DEPLOYMENT_BRIDGE_RESULT=${JSON.stringify(result)}`);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

async function main() {
  const command = process.argv[2];
  if (command === "gate") {
    await commandGate();
    return;
  }
  if (command === "running") {
    await commandRunning();
    return;
  }
  if (command === "health") {
    await commandHealth();
    return;
  }
  if (command === "complete") {
    await commandComplete();
    return;
  }
  if (command === "publish") {
    await commandPublish();
    return;
  }
  throw new Error("unknown_command");
}

if (isDirectRun()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "deployment_bridge_failed";
    if (message.includes("github_pat_") || message.includes("BEGIN ")) {
      console.error("deployment_bridge_failed");
    } else {
      console.error(message);
    }
    process.exit(1);
  });
}
