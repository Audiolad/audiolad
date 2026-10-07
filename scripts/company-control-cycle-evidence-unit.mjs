/**
 * LABELLED TEST for Company Core task c6842c34-f715-4587-8d99-59c8fec577e6.
 *
 * This file does not call Company Core, does not dispatch Deployment Bridge,
 * does not merge, and does not set production_verified.
 * A green result only checks that the recorded observations stay distinct
 * and that a Human Gate answer continues the same linked task.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const TASK_ID = "c6842c34-f715-4587-8d99-59c8fec577e6";
const EXECUTIVE_AGENT_RUN_ID = "bc-e3508c58-cd2d-5ce3-8c00-54eab5f6abf2";

const EVIDENCE_STAGES = [
  "connection_verified",
  "dispatch_accepted",
  "repository_evidence",
  "deploy_success",
  "production_verified",
];

const HUMAN_GATE = {
  owner: "Oriy",
  linkedTaskId: TASK_ID,
  requiredDecision:
    "Подтверди, что существующий MCP https://company.audiolad.ru/mcp уже реализует MCP Events протокола 2026-07-28 (capability events, methods events/list, events/subscribe, events/unsubscribe, подписки в Company DB, подписанный webhook в ChatGPT). Если нет — разреши добавить только эту возможность в текущий MCP приватного Audiolad/company-core, без второго оркестратора.",
  reason:
    "Исполнитель получил HTTP 401 на POST /mcp и POST /v1/executive/events (scope oriy) и GitHub 404 на Audiolad/company-core. Токен в чат, PR и логи не запрашивается. Пока Орий не ответил, фоновое пробуждение без ноутбука Сергея не доказано.",
};

const OBSERVED = {
  labelledTest: true,
  taskId: TASK_ID,
  executiveAgentRunId: EXECUTIVE_AGENT_RUN_ID,
  productionVerified: false,
  thisTaskMerged: false,
  thisTaskDispatched: false,
  probes: {
    companyApiHealth: { path: "/health", httpStatus: 200, service: "company-api" },
    companyStatus: { path: "/v1/status", httpStatus: 401 },
    executiveEventsPost: { path: "/v1/executive/events", httpStatus: 401 },
    mcpPost: { path: "/mcp", httpStatus: 401, scope: "oriy" },
    companyCoreRepository: { name: "Audiolad/company-core", githubStatus: 404 },
  },
  deploymentBridge: {
    eventType: "deployment-bridge",
    historicalRepositoryDispatch: {
      runId: 36760857474,
      conclusion: "failure",
      gateError: "ci_pending",
      sha: "f40403594f72a0893f5047704e4a1b989d322e3a",
      countsAsThisTask: false,
    },
    historicalWorkflowDispatchSuccess: {
      runId: 36763750867,
      conclusion: "success",
      event: "workflow_dispatch",
      countsAsThisTask: false,
    },
    liveProductionDeployCommitAtIntake: "88daaeb0689b9c6ba0d3efecceef276355a74336",
    liveProductionDeployCommitAfterMainAdvanced: "768e22a66c6413363145d25d52ec291999e03d10",
    liveProductionMatchesThisTask: false,
  },
};

function evidenceRecord(stage) {
  assert.ok(EVIDENCE_STAGES.includes(stage), stage);
  return { stage, productionVerified: stage === "production_verified" };
}

function isProductionVerified(record) {
  return record.productionVerified === true && record.stage === "production_verified";
}

function applyHumanGateAnswer(tasks, taskId, answer) {
  const text = typeof answer === "string" ? answer.trim() : "";
  if (!text) {
    throw new Error("human_gate_answer_required");
  }
  let linked = false;
  const next = tasks.map((task) => {
    if (task.id !== taskId) return task;
    if (task.status !== "human_gate") {
      throw new Error("linked_task_not_in_human_gate");
    }
    linked = true;
    return {
      ...task,
      status: "in_progress",
      humanGateAnswer: text,
      continuedFromTaskId: task.id,
    };
  });
  if (!linked) throw new Error("linked_task_missing");
  return next;
}

const workflow = readFileSync(".github/workflows/deployment-bridge.yml", "utf8");
assert.match(workflow, /repository_dispatch:/);
assert.match(workflow, /types:\s*\[deployment-bridge\]/);
assert.doesNotMatch(workflow, /production_verified\s*=\s*true/);

assert.equal(OBSERVED.labelledTest, true);
assert.equal(OBSERVED.taskId, TASK_ID);
assert.equal(OBSERVED.executiveAgentRunId, EXECUTIVE_AGENT_RUN_ID);
assert.equal(OBSERVED.productionVerified, false);
assert.equal(OBSERVED.thisTaskMerged, false);
assert.equal(OBSERVED.thisTaskDispatched, false);
assert.equal(OBSERVED.probes.companyApiHealth.httpStatus, 200);
assert.equal(OBSERVED.probes.mcpPost.httpStatus, 401);
assert.equal(OBSERVED.probes.executiveEventsPost.httpStatus, 401);
assert.equal(OBSERVED.deploymentBridge.historicalRepositoryDispatch.countsAsThisTask, false);
assert.equal(OBSERVED.deploymentBridge.historicalWorkflowDispatchSuccess.event, "workflow_dispatch");
assert.equal(OBSERVED.deploymentBridge.liveProductionMatchesThisTask, false);
assert.notEqual(
  OBSERVED.deploymentBridge.liveProductionDeployCommitAtIntake,
  OBSERVED.deploymentBridge.liveProductionDeployCommitAfterMainAdvanced,
);

for (const stage of EVIDENCE_STAGES) {
  const record = evidenceRecord(stage);
  if (stage === "production_verified") {
    assert.equal(isProductionVerified(record), true);
  } else {
    assert.equal(isProductionVerified(record), false);
  }
}
assert.equal(new Set(EVIDENCE_STAGES).size, EVIDENCE_STAGES.length);

assert.equal(HUMAN_GATE.linkedTaskId, TASK_ID);
assert.ok(HUMAN_GATE.requiredDecision.length > 40);
assert.ok(HUMAN_GATE.reason.length > 40);

const beforeGate = [
  {
    id: TASK_ID,
    status: "human_gate",
    requiredDecision: HUMAN_GATE.requiredDecision,
    reason: HUMAN_GATE.reason,
  },
  {
    id: "labelled-test-pr",
    status: "in_progress",
    requiredDecision: null,
  },
];

assert.throws(() => applyHumanGateAnswer(beforeGate, TASK_ID, "   "), /human_gate_answer_required/);

const afterGate = applyHumanGateAnswer(
  beforeGate,
  TASK_ID,
  "MCP Events на существующем /mcp ещё нет. Разрешаю добавить только events/list, events/subscribe и events/unsubscribe в Audiolad/company-core.",
);
const linked = afterGate.find((task) => task.id === TASK_ID);
const independent = afterGate.find((task) => task.id === "labelled-test-pr");
assert.equal(linked.status, "in_progress");
assert.equal(linked.continuedFromTaskId, TASK_ID);
assert.match(linked.humanGateAnswer, /company-core/);
assert.equal(independent.status, "in_progress");
assert.equal(independent.requiredDecision, null);
assert.equal(beforeGate[0].status, "human_gate");
assert.equal(beforeGate[1].status, "in_progress");

assert.equal(isProductionVerified({ stage: "dispatch_accepted", productionVerified: false }), false);
assert.equal(isProductionVerified({ stage: "repository_evidence", productionVerified: false }), false);
assert.equal(isProductionVerified({ stage: "deploy_success", productionVerified: false }), false);

console.log("company-control-cycle-evidence-unit: ok");
