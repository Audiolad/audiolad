import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { formatAiCompanyTaskCopy } from "../src/lib/admin/ai-company-task-copy";
import {
  AI_COMPANY_OPEN_ROWS_KEY,
  AI_COMPANY_SCROLL_KEY,
  parseOpenRows,
  serializeOpenRows,
  toggleOpenRow,
} from "../src/lib/admin/ai-company-disclosure";
import {
  ADMIN_NAV_ITEMS,
  getVisibleAdminNavItems,
} from "../src/lib/admin/nav";
import {
  CORE_FIELD_MAP,
  buildAiCompanyDashboard,
  classifyExecutor,
  companyStatusRequestPath,
  isCompletedStatus,
  parseCompanyStatus,
  parseHistoryFilters,
  resolveCurrentTask,
} from "../src/lib/admin/ai-company-dashboard";
import {
  resolvePermissionsForRoles,
  type PlatformTeamRole,
} from "../src/lib/auth/platform-permissions";

const generatedAt = "2026-09-30T10:00:00.000Z";

function accessForRoles(roles: PlatformTeamRole[]) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    roles,
    permissions: resolvePermissionsForRoles(roles),
    usedLegacyFallback: false,
  };
}

function rawStatus(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: generatedAt,
    agents: [],
    tasks: [],
    heartbeats: [],
    recent_events: [],
    costs: { amount_usd: "1.25", input_units: 10, output_units: 4 },
    ...overrides,
  };
}

const parsed = parseCompanyStatus(
  rawStatus({
    agents: [
      {
        slug: "engineering",
        role: "engineering",
        status: "working",
        autonomy_level: 1,
        current_task_id: "task-wait",
        last_heartbeat_at: "2026-09-30T09:30:00.000Z",
      },
      {
        slug: "qa",
        role: "qa",
        status: "human_gate",
        current_task_id: "task-qa",
        last_heartbeat_at: "2026-09-30T09:40:00.000Z",
      },
      {
        slug: "product",
        role: "product",
        status: "available",
        current_task_id: null,
        last_heartbeat_at: null,
      },
      {
        slug: "research",
        role: "research",
        status: "working",
        current_task_id: "task-stale",
        last_heartbeat_at: "2026-09-29T08:00:00.000Z",
      },
    ],
    tasks: [
      {
        id: "task-wait",
        title: "Ждёт проверку",
        status: "waiting",
        producer_agent_slug: "engineering",
        github_issue_number: 655,
        human_gate: "none",
        blocked_reason: null,
        updated_at: generatedAt,
        received_at: "2026-09-29T12:00:00.000Z",
        result_consumer: "qa",
      },
      {
        id: "task-active",
        title: "Другая активная задача",
        status: "in_progress",
        producer_agent_slug: "engineering",
        updated_at: generatedAt,
        created_at: generatedAt,
      },
      {
        id: "task-qa",
        title: "Табло после QA",
        status: "qa_pass",
        producer_agent_slug: "qa",
        human_gate: "Sergey",
        updated_at: generatedAt,
        created_at: "2026-09-28T00:00:00.000Z",
      },
      {
        id: "task-done",
        title: "Старая готовая задача",
        status: "done",
        producer_agent_slug: "product",
        updated_at: generatedAt,
        created_at: "2026-09-01T00:00:00.000Z",
        completed_at: "2026-09-20T00:00:00.000Z",
      },
      {
        id: "task-today",
        title: "Получена сегодня",
        status: "review",
        producer_agent_slug: "ux",
        received_at: "2026-09-30T07:15:00.000Z",
        updated_at: "2026-09-30T07:16:00.000Z",
      },
      {
        id: "task-updated-only",
        title: "Только обновлена сегодня",
        status: "waiting",
        producer_agent_slug: "analytics",
        updated_at: generatedAt,
      },
      {
        id: "task-stale",
        title: "Зависшая работа",
        status: "working",
        producer_agent_slug: "research",
        started_at: "2026-09-29T07:00:00.000Z",
      },
    ],
    recent_events: [
      {
        event_type: "qa_return",
        agent_slug: "qa",
        task_id: "task-qa",
        created_at: "2026-09-30T08:00:00.000Z",
        payload: {
          verdict: "RETURN",
          pr_url: "https://github.com/Audiolad/audiolad/pull/656",
          ci_status: "skipped",
          api_key: "must-not-leak",
          prompt: "must-not-leak",
        },
      },
      {
        event_type: "result_ready",
        agent_slug: "engineering",
        task_id: "task-wait",
        created_at: "2026-09-30T09:00:00.000Z",
        payload: { result: "Черновик табло готов" },
      },
    ],
  }),
);

assert.ok(parsed, "status payload parses");
assert.equal(isCompletedStatus("qa_pass"), false);
assert.equal(isCompletedStatus("done"), true);
assert.equal(isCompletedStatus("merged"), false);
assert.equal(isCompletedStatus("deployed"), false);

const engineering = parsed!.agents.find((agent) => agent.slug === "engineering")!;
const current = resolveCurrentTask(engineering, parsed!.tasks);
assert.equal(current?.id, "task-wait");
assert.equal(current?.status, "waiting");

const model = buildAiCompanyDashboard(parsed!, parseHistoryFilters({}));
const engineeringCard = model.agents.find((agent) => agent.slug === "engineering")!;
assert.equal(engineeringCard.currentTaskTitle, "Ждёт проверку");
assert.equal(engineeringCard.tone, "working");
assert.match(engineeringCard.latestResult, /Черновик табло готов/);
assert.equal(engineeringCard.handoff, "Контроль качества (QA)");
assert.equal(
  model.decisions.some((item) => item.taskTitle.includes("Продуктовый")),
  false,
);
assert.equal(
  model.decisions.some((item) => item.reason.includes("Ручное разрешение") && item.decisionOwner === "Сергей"),
  true,
);

const qaCard = model.agents.find((agent) => agent.slug === "qa")!;
assert.equal(qaCard.tone, "waiting");
assert.match(qaCard.stateLabel, /Ожидает/);
assert.equal(qaCard.currentTaskTitle, "Табло после QA");
assert.match(qaCard.qaState, /RETURN/);
assert.doesNotMatch(qaCard.qaState, /must-not-leak/);

const productCard = model.agents.find((agent) => agent.slug === "product")!;
assert.equal(productCard.tone, "unknown");
assert.match(productCard.stateLabel, /нет свежих данных/);

const researchCard = model.agents.find((agent) => agent.slug === "research")!;
assert.equal(researchCard.tone, "attention");
assert.match(researchCard.freshness, /старше 60 минут/);
assert.match(researchCard.startedAt, /29\.09\.2026/);

const uxCard = model.agents.find((agent) => agent.slug === "ux")!;
assert.equal(uxCard.tone, "unknown");
assert.equal(uxCard.currentTaskTitle, "Нет данных");

assert.deepEqual(
  model.todayReceived.map((row) => row.title),
  ["Получена сегодня"],
);
assert.deepEqual(
  model.todayCreated.map((row) => row.title),
  ["Другая активная задача"],
);
assert.equal(
  model.todayReceived.some((row) => row.title === "Только обновлена сегодня"),
  false,
);
assert.equal(
  model.todayReceived.some((row) => row.title === "Ждёт проверку"),
  false,
);
assert.equal(model.todayCompleted.length, 0);
assert.equal(model.todayWorkEvents.length, 2);

const createdToday = model.todayCreated.find((row) => row.title === "Другая активная задача");
assert.ok(createdToday);
assert.match(createdToday.detail.receivedAt, /создание записи/);

assert.equal(
  model.history.some((item) => item.title === "Табло после QA"),
  false,
);
assert.equal(model.history.some((item) => item.title === "Старая готовая задача"), true);
const done = model.history.find((item) => item.title === "Старая готовая задача")!;
assert.match(done.completedAt, /20\.09\.2026/);
assert.match(done.outcome, /Выполнено/);

const todayHistory = buildAiCompanyDashboard(parsed!, parseHistoryFilters({ period: "today" }));
assert.equal(todayHistory.history.length, 0);

const missingLink = parseCompanyStatus(
  rawStatus({
    agents: [
      {
        slug: "orchestrator",
        status: "waiting",
        current_task_id: "missing-task",
        last_heartbeat_at: generatedAt,
      },
    ],
    tasks: [
      {
        id: "other",
        title: "Чужая задача",
        status: "waiting",
        producer_agent_slug: "orchestrator",
        received_at: generatedAt,
      },
    ],
  }),
)!;
const missingModel = buildAiCompanyDashboard(missingLink, parseHistoryFilters({}));
const orchestrator = missingModel.agents.find((agent) => agent.slug === "orchestrator")!;
assert.equal(orchestrator.currentTaskTitle, "Нет данных");
assert.equal(orchestrator.currentTaskTechnicalId, "missing-task");
assert.equal(orchestrator.tone, "waiting");

const ambiguous = parseCompanyStatus(
  rawStatus({
    agents: [{ slug: "analytics", status: "idle", current_task_id: null }],
    tasks: [
      { id: "a", title: "Первая", status: "review", producer_agent_slug: "analytics" },
      { id: "b", title: "Вторая", status: "human_gate", producer_agent_slug: "analytics", human_gate: "Sergey" },
    ],
  }),
)!;
const ambiguousCard = buildAiCompanyDashboard(ambiguous, parseHistoryFilters({})).agents.find(
  (agent) => agent.slug === "analytics",
)!;
assert.equal(ambiguousCard.currentTaskTitle, "Нет данных");
assert.equal(ambiguousCard.tone, "unknown");

const singleWaiting = parseCompanyStatus(
  rawStatus({
    agents: [{ slug: "ux", status: "idle", current_task_id: null }],
    tasks: [
      {
        id: "only",
        title: "Единственное ожидание",
        status: "human_gate",
        producer_agent_slug: "ux",
        human_gate: "Sergey",
      },
    ],
  }),
)!;
const singleCard = buildAiCompanyDashboard(singleWaiting, parseHistoryFilters({})).agents.find(
  (agent) => agent.slug === "ux",
)!;
assert.equal(singleCard.currentTaskTitle, "Единственное ожидание");
assert.match(singleCard.waitReason, /Human Gate/);

const noReceipt = parseCompanyStatus(
  rawStatus({
    tasks: [
      {
        id: "old",
        title: "Старая задача",
        status: "waiting",
        updated_at: generatedAt,
        producer_agent_slug: "product",
      },
    ],
  }),
)!;
const noReceiptModel = buildAiCompanyDashboard(noReceipt, parseHistoryFilters({}));
assert.equal(noReceiptModel.todayReceived.length, 0);
assert.match(noReceiptModel.todayNote, /Нет данных о времени получения/);

const qaHistory = model.agents.find((agent) => agent.slug === "qa")!;
assert.match(qaHistory.qaState, /pull\/656/);
assert.match(qaHistory.qaState, /skipped/);

const markup = renderToStaticMarkup(
  <AiCompanyDashboardView model={model} filters={parseHistoryFilters({})} sourceError={null} onRefresh={() => undefined} />,
);
assert.match(markup, /Сейчас в работе/);
assert.match(markup, /Сегодня/);
assert.match(markup, /Получены сегодня/);
assert.match(markup, /События работы сегодня/);
assert.match(markup, /Завершены сегодня/);
assert.match(markup, /Завершённые результаты/);
assert.match(markup, /ИИ-компания/);
assert.match(markup, /Обновить данные/);
assert.match(markup, /data-state="working"/);
assert.match(markup, /data-state="unknown"/);
assert.match(markup, /data-state="attention"/);
assert.match(markup, /grid-cols-2/);
assert.match(markup, /lg:grid-cols-2/);
assert.match(markup, /data-compact-row=/);
assert.match(markup, /aria-expanded="false"/);
assert.doesNotMatch(markup, /lg:grid-cols-3/);
assert.match(markup, /sm:flex-row/);
const historyMarkup = markup.slice(markup.indexOf('data-section="history"'));
assert.doesNotMatch(historyMarkup, /Табло после QA/);
assert.match(historyMarkup, /Старая готовая задача/);
assert.doesNotMatch(markup, /must-not-leak/);
assert.doesNotMatch(markup, /\$1\.25/);

assert.equal(parseCompanyStatus({ tasks: [], agents: [] }), null);

const page = readFileSync("src/app/(platform)/admin/ai-company/page.tsx", "utf8");
const dashboardSource = readFileSync("src/components/admin/AiCompanyDashboard.tsx", "utf8");
assert.match(page, /requireAdminPermission\("ai_company\.view"\)/);
assert.match(page, /parseCompanyStatus/);
assert.match(page, /companyStatusRequestPath/);
assert.match(page, /<AiCompanyLiveRefresh/);
assert.doesNotMatch(page, /updated_at/);
assert.doesNotMatch(page, /httpEquiv|http-equiv/);
assert.match(dashboardSource, /router\.refresh/);
const liveRefresh = readFileSync("src/lib/admin/ai-company-live-refresh.ts", "utf8");
assert.match(liveRefresh, /clearInterval/);
assert.match(liveRefresh, /startScopedPageRefresh/);
assert.match(dashboardSource, /data-section="now"/);
assert.equal(companyStatusRequestPath(parseHistoryFilters({})), "/v1/status");
assert.equal(
  companyStatusRequestPath(parseHistoryFilters({ history_before: "2026-10-07T06:00:00.000Z" })),
  "/v1/status?history_before=2026-10-07T06%3A00%3A00.000Z",
);
assert.equal(companyStatusRequestPath(parseHistoryFilters({ history_before: "page-2" })), "/v1/status");

const navItem = ADMIN_NAV_ITEMS.find((item) => item.href === "/admin/ai-company");
assert.ok(navItem);
assert.equal(navItem.label, "ИИ-компания");
assert.equal(navItem.requiredPermission, "ai_company.view");
assert.equal(
  getVisibleAdminNavItems(accessForRoles(["owner"])).some((item) => item.href === "/admin/ai-company"),
  true,
);
assert.equal(
  getVisibleAdminNavItems(accessForRoles(["admin"])).some((item) => item.href === "/admin/ai-company"),
  true,
);
for (const role of ["editor", "support", "analyst", "finance"] as const) {
  assert.equal(
    getVisibleAdminNavItems(accessForRoles([role])).some((item) => item.href === "/admin/ai-company"),
    false,
    `${role} must not see AI company`,
  );
}

const overview = ADMIN_NAV_ITEMS.find((item) => item.href === "/admin");
assert.ok(overview);
assert.equal(overview.label, "Обзор");
assert.equal(overview.requiredPermission, "dashboard.view");
assert.equal(CORE_FIELD_MAP.task.id[0], "id");
assert.equal(CORE_FIELD_MAP.task.receivedAt[0], "received_at");
assert.equal(CORE_FIELD_MAP.task.verifiedProgress[0], "progress");
assert.equal(CORE_FIELD_MAP.task.verifiedProgress[1], "verified_progress");
assert.equal(CORE_FIELD_MAP.task.functionalRole[0], "role");
assert.equal(CORE_FIELD_MAP.task.functionalRole[1], "producer_agent_slug");
assert.equal(CORE_FIELD_MAP.task.actualExecutor[0], "executor");
assert.equal(CORE_FIELD_MAP.task.nextStep[0], "next_action");
assert.equal(CORE_FIELD_MAP.executiveRun.headSha[0], "head_sha");
assert.equal(CORE_FIELD_MAP.executiveRun.ci[0], "ci_status");
assert.equal(CORE_FIELD_MAP.executiveRun.independentReview[0], "review_status");
assert.equal(CORE_FIELD_MAP.executiveRun.deploy[0], "deploy_status");
assert.equal(CORE_FIELD_MAP.executiveRun.productionProof[0], "production_proof");
assert.equal(CORE_FIELD_MAP.executiveRun.productionVerified[0], "production_verified");
assert.equal(CORE_FIELD_MAP.executiveRun.merged[0], "merged");
assert.equal(CORE_FIELD_MAP.task.merged[0], "merged");
assert.equal(CORE_FIELD_MAP.task.releaseHold[0], "release_hold");
assert.equal(CORE_FIELD_MAP.task.releaseHold[1], "hold_reason");
assert.equal(CORE_FIELD_MAP.query.historyBefore, "history_before");
assert.equal(CORE_FIELD_MAP.page.historyNextBefore[0], "history_next_before");
assert.equal(CORE_FIELD_MAP.root.events[0], "recent_events");
assert.equal(CORE_FIELD_MAP.root.currentGates[0], "gates");
assert.equal(CORE_FIELD_MAP.root.archivedBlockers[0], "gates_history");
assert.equal(CORE_FIELD_MAP.root.coverage[0], "coverage");
assert.equal(CORE_FIELD_MAP.root.codex[0], "codex");
assert.equal(classifyExecutor(["cursor", "grok-4.7"]), "cursor");
assert.equal(classifyExecutor(["codex"]), "codex");
assert.equal(classifyExecutor(["xai", "grok"]), "grok");

const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const otherSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const live = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  agents: [
    { slug: "engineering", status: "working", current_task_id: "b01cd5d3-052b-4e21-9236-184b3c5f2a5e", last_heartbeat_at: "2026-10-07T06:20:00.000Z" },
    { slug: "orchestrator", status: "idle", last_heartbeat_at: "2026-10-07T06:30:00.000Z" },
  ],
  tasks: [
    {
      id: "b01cd5d3-052b-4e21-9236-184b3c5f2a5e",
      title: "Сделать рабочее табло ИИ-компании",
      status: "in_progress",
      priority: "p1",
      functional_role: "engineering",
      fallback_executor: "cursor",
      next_step: "Сверить контракт статуса с Company Core",
      result_type: "engineering",
      updated_at: "2026-10-07T06:39:00.000Z",
      created_at: "2026-10-06T18:00:00.000Z",
      received_at: "2026-10-06T18:05:00.000Z",
      started_at: "2026-10-06T18:10:00.000Z",
      last_event_at: "2026-10-07T06:35:00.000Z",
      verified_progress: null,
      progress_percent: 80,
      dependencies: [{ target: "codex", status: "blocked", title: "Codex readiness" }],
      executive_run: {
        provider: "cursor",
        channel: "cursor",
        model: "grok-4.7",
        run_id: "bc-669e1e69-a735-5804-a8e7-903a4d2a2fb0",
        last_event: "run in progress",
        head_sha: headSha,
        pr_url: "https://github.com/Audiolad/audiolad/pull/700",
        ci: { status: "success", sha: headSha },
        independent_review: { verdict: "pass", sha: otherSha },
        deploy: { status: "deployed" },
        production_proof: null,
      },
    },
    {
      id: "received-today",
      title: "Задача получена сегодня",
      status: "queued",
      functional_role: "product",
      result_type: "document",
      received_at: "2026-10-07T00:30:00.000Z",
      updated_at: "2026-10-06T12:00:00.000Z",
    },
    {
      id: "updated-only-today",
      title: "Только обновлена седьмого",
      status: "waiting",
      functional_role: "analytics",
      updated_at: "2026-10-07T06:00:00.000Z",
      received_at: "2026-10-05T10:00:00.000Z",
    },
    {
      id: "research-done-today",
      title: "Исследование закрыто сегодня",
      status: "done",
      functional_role: "research",
      result_type: "research",
      received_at: "2026-10-01T10:00:00.000Z",
      completed_at: "2026-10-07T05:00:00.000Z",
      updated_at: "2026-10-04T05:00:00.000Z",
    },
    {
      id: "merged-not-done",
      title: "Слитый черновик без проверки",
      status: "merged",
      functional_role: "engineering",
      result_type: "engineering",
      received_at: "2026-09-01T10:00:00.000Z",
      updated_at: "2026-10-07T06:00:00.000Z",
      executive_run: { head_sha: headSha, ci: { status: "success", sha: headSha } },
    },
    {
      id: "pilot-codex",
      title: "Пилот Codex",
      status: "done",
      functional_role: "engineering",
      result_type: "engineering",
      dependencies: [{ target: "codex", status: "blocked", title: "Codex readiness" }],
      executive_run: {
        head_sha: headSha,
        ci: { status: "success", sha: headSha },
        independent_review: { verdict: "pass", sha: headSha },
        deploy: { status: "deployed" },
        production_proof: { status: "verified", url: "https://audiolad.ru/admin/ai-company" },
      },
    },
    {
      id: "measured",
      title: "Задача с единицами",
      status: "in_progress",
      functional_role: "ux",
      result_type: "document",
      started_at: "2026-10-02T10:00:00.000Z",
      verified_progress: {
        done: 4,
        total: 7,
        formula: "закрытые критерии приёмки",
        evidence_at: "2026-10-06T12:00:00.000Z",
      },
    },
  ],
  active_tasks: [
    {
      id: "older-active",
      title: "Активная задача прошлого дня",
      status: "in_progress",
      priority: "p0",
      functional_role: "qa",
      started_at: "2026-10-03T08:00:00.000Z",
      verified_progress: { percent: 90 },
    },
  ],
  current_gates: [
    {
      id: "gate-oriy",
      task_id: "b01cd5d3-052b-4e21-9236-184b3c5f2a5e",
      reason: "Codex readiness: исполнитель не подключён",
      decision_owner: "Sergey",
      request: "Переназначьте задачу на другого исполнителя",
      next_action: "Сергей меняет исполнителя",
      kind: "readiness",
      target: "codex",
    },
    {
      id: "gate-product",
      task_id: "received-today",
      reason: "Нужно подтвердить формулировку для каталога",
      decision_owner: "Oriy",
      request: "Подтвердить текст",
      next_action: "Орий отвечает в задаче",
    },
  ],
  archived_blockers: [
    {
      id: "old-block",
      task_id: "research-done-today",
      reason: "Старый блокер уже снят",
      decision_owner: "Oriy",
      archived: true,
    },
  ],
  executors: [
    { provider: "cursor", model: "grok-4.7", connection_state: "online", last_heartbeat_at: "2026-10-07T06:30:00.000Z" },
  ],
  heartbeats: [
    { service_key: "cursor", observed_at: "2026-10-07T06:30:00.000Z", state: "online" },
    { service_key: "grok", observed_at: "2026-10-07T04:00:00.000Z", state: "online" },
  ],
  recent_events: [
    {
      event_type: "oriy:progress",
      task_id: null,
      created_at: "2026-10-07T06:35:00.000Z",
      payload: {
        task_id: "b01cd5d3-052b-4e21-9236-184b3c5f2a5e",
        run_id: "bc-669e1e69-a735-5804-a8e7-903a4d2a2fb0",
        message: "исполнитель пишет табло",
      },
    },
  ],
  costs: { amount_usd: 0 },
  quotas: {
    codex: { included_used: 0, included_limit: 0 },
  },
  completeness: {
    active_tasks_complete: true,
    events_complete: false,
    history_complete: false,
    next_cursor: "hist-2",
  },
});
assert.ok(live);
const liveModel = buildAiCompanyDashboard(live!, parseHistoryFilters({}));
const boardTask = liveModel.activeTasks.find((task) => task.taskId === "b01cd5d3-052b-4e21-9236-184b3c5f2a5e");
assert.ok(boardTask);
assert.equal(boardTask.priority, "p1");
assert.match(boardTask.functionalRole, /Инженер/);
assert.equal(boardTask.executorLabel, "Cursor");
assert.match(boardTask.executorNote, /не отдельный запуск xAI/);
assert.match(boardTask.progress, /прогресс пока не измерен/);
assert.doesNotMatch(boardTask.progress, /80/);
assert.match(boardTask.lastEvent, /run in progress/);
assert.match(boardTask.nextStep, /контракт статуса/);
assert.match(boardTask.codexNote, /не подключён/);
assert.match(boardTask.codexNote, /Cursor/);
assert.equal(boardTask.engineering.ci, "success");
assert.match(boardTask.engineering.independentReview, /другого SHA/);
assert.equal(boardTask.engineering.deploy, "deployed");
assert.equal(boardTask.engineering.production, "Нет данных");
assert.equal(boardTask.engineering.dodSatisfied, false);
assert.equal(liveModel.activeTasks.some((task) => task.title === "Активная задача прошлого дня"), true);
assert.match(
  liveModel.activeTasks.find((task) => task.title === "Активная задача прошлого дня")!.progress,
  /прогресс пока не измерен/,
);
assert.equal(liveModel.todayReceived.some((row) => row.title === "Задача получена сегодня"), true);
assert.equal(liveModel.todayReceived.some((row) => row.title === "Только обновлена седьмого"), false);
assert.equal(liveModel.todayReceived.some((row) => row.title === "Сделать рабочее табло ИИ-компании"), false);
assert.equal(liveModel.todayWorkEvents.some((event) => event.text.includes("oriy:progress")), true);
assert.equal(liveModel.todayCompleted.some((row) => row.title === "Исследование закрыто сегодня"), true);
assert.equal(liveModel.todayCompleted.some((row) => row.title === "Слитый черновик без проверки"), false);
assert.equal(liveModel.history.some((item) => item.title === "Слитый черновик без проверки"), false);
const mergedDraft = liveModel.activeTasks.find((task) => task.title === "Слитый черновик без проверки");
assert.ok(mergedDraft);
assert.equal(mergedDraft.detail.stageBadge.label, "Ожидает выпуска");
assert.equal(mergedDraft.detail.stageBadge.tone, "release");
assert.doesNotMatch(mergedDraft.detail.stageBadge.detail ?? "", /деплоим|Завершена/);
assert.equal(liveModel.history.some((item) => item.title === "Пилот Codex"), false);
assert.equal(liveModel.activeTasks.some((task) => task.title === "Пилот Codex"), true);
assert.match(
  liveModel.activeTasks.find((task) => task.title === "Пилот Codex")!.detail.outcome,
  /Пилот не отмечен успешным/,
);
assert.match(
  liveModel.activeTasks.find((task) => task.title === "Пилот Codex")!.stage,
  /Пилот не отмечен успешным/,
);
assert.equal(liveModel.activeTasks.find((task) => task.title === "Пилот Codex")!.detail.stageBadge.label, "Заблокирована");
assert.match(
  liveModel.activeTasks.find((task) => task.title === "Пилот Codex")!.detail.stageBadge.detail ?? "",
  /Пилот не отмечен успешным/,
);
const boardBadge = liveModel.activeTasks.find((task) => task.taskId === "b01cd5d3-052b-4e21-9236-184b3c5f2a5e")!;
assert.equal(boardBadge.detail.stageBadge.label, "Нужно решение");
assert.match(boardBadge.detail.stageBadge.detail ?? "", /^Сергей:/);
assert.doesNotMatch(boardBadge.detail.stageBadge.detail ?? "", /Переназначьте|деплоим/);
const measured = liveModel.activeTasks.find((task) => task.title === "Задача с единицами");
assert.ok(measured);
assert.match(measured.progress, /4 из 7/);
assert.match(measured.progress, /закрытые критерии приёмки/);
assert.match(measured.progress, /06\.10\.2026/);
assert.doesNotMatch(measured.progress, /100%/);
const codexGate = liveModel.decisions.find((gate) => gate.reason.includes("Codex readiness"));
assert.ok(codexGate);
assert.equal(codexGate.decisionOwner, "Сергей");
assert.match(codexGate.nextAction, /Переназначение от Сергея не требуется/);
assert.doesNotMatch(`${codexGate.request} ${codexGate.nextAction}`, /Переназначьте/);
assert.match(codexGate.freshness, /Свежесть/);
const productGate = liveModel.decisions.find((gate) => gate.reason.includes("формулировку"));
assert.ok(productGate);
assert.equal(productGate.decisionOwner, "Oriy");
assert.equal(liveModel.decisions.some((gate) => gate.reason.includes("Старый блокер")), false);
assert.equal(liveModel.archivedBlockers.some((gate) => gate.reason.includes("Старый блокер")), true);
const codex = liveModel.executors.find((executor) => executor.id === "codex")!;
assert.equal(codex.connection, "not_connected");
const cursor = liveModel.executors.find((executor) => executor.id === "cursor")!;
assert.equal(cursor.connection, "online");
const grok = liveModel.executors.find((executor) => executor.id === "grok")!;
assert.equal(grok.connection, "no_fresh_data");
assert.match(liveModel.activeBoundary, /лента событий обрезана|событий/);
assert.match(liveModel.historyBoundary, /история обрезана|История/);
assert.equal(liveModel.quotas.find((line) => line.id === "legacy")!.value, "Нет данных");
assert.equal(liveModel.quotas.find((line) => line.id === "codex")!.value, "Нет данных");
assert.match(liveModel.quotas.find((line) => line.id === "cursor")!.checkPath, /Cursor/);

const priced = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  tasks: [],
  agents: [],
  quotas: {
    codex: { source: "openai_usage", remaining: 12, limit: 50, reset_at: "2026-10-08T00:00:00.000Z", trustworthy: true },
    cursor: { source: "cursor_pool", remaining: 0, limit: 20, trustworthy: true },
    grok: { source: "unconfirmed", remaining: 3, trustworthy: false },
  },
  costs: { amount_usd: 0, source: "unknown" },
})!;
const pricedModel = buildAiCompanyDashboard(priced, parseHistoryFilters({}));
assert.match(pricedModel.quotas.find((line) => line.id === "codex")!.value, /Остаток: 12 из 50/);
assert.match(pricedModel.quotas.find((line) => line.id === "codex")!.value, /не расход/);
assert.match(pricedModel.quotas.find((line) => line.id === "cursor")!.value, /Остаток: 0 из 20/);
assert.match(pricedModel.quotas.find((line) => line.id === "cursor")!.value, /не расход/);
assert.equal(pricedModel.quotas.find((line) => line.id === "grok")!.value, "Нет данных");
assert.equal(pricedModel.quotas.find((line) => line.id === "legacy")!.value, "Нет данных");

const exact = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  tasks: [
    {
      id: "shipped",
      title: "Инженерная задача закрыта",
      status: "in_progress",
      result_type: "engineering",
      functional_role: "engineering",
      started_at: "2026-10-07T01:00:00.000Z",
      completed_at: "2026-10-07T06:00:00.000Z",
      verified_progress: { done: 7, total: 7, formula: "критерии DoD", evidence_at: "2026-10-07T06:00:00.000Z" },
      executive_run: {
        provider: "cursor",
        head_sha: headSha,
        ci: { status: "success", sha: headSha },
        independent_review: { verdict: "pass", sha: headSha },
        deploy: { status: "deployed" },
        production_proof: { status: "verified", url: "https://audiolad.ru/admin/ai-company", at: "2026-10-07T06:10:00.000Z" },
      },
    },
  ],
  agents: [],
})!;
const exactModel = buildAiCompanyDashboard(exact, parseHistoryFilters({}));
assert.equal(exactModel.activeTasks.some((task) => task.title === "Инженерная задача закрыта"), false);
const shipped = exactModel.history.find((item) => item.title === "Инженерная задача закрыта");
assert.ok(shipped);
assert.match(shipped.progress, /7 из 7/);
assert.match(shipped.progress, /100%/);
assert.match(shipped.engineering.independentReview, new RegExp(headSha));
assert.match(shipped.engineering.production, /audiolad\.ru/);
assert.equal(exactModel.todayCompleted.length, 1);
assert.equal(shipped.stageBadge.label, "Завершена");
assert.equal(shipped.stageBadge.tone, "done");

const capped = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  tasks: Array.from({ length: 100 }, (_, index) => ({
    id: `cap-${index}`,
    title: `Задача ${index}`,
    status: index === 0 ? "in_progress" : "done",
    result_type: "document",
    completed_at: index === 0 ? null : "2026-09-01T00:00:00.000Z",
    started_at: index === 0 ? "2026-10-01T00:00:00.000Z" : null,
  })),
  recent_events: Array.from({ length: 50 }, (_, index) => ({
    event_type: "executive:progress",
    task_id: "cap-0",
    created_at: `2026-10-07T06:${String(index % 60).padStart(2, "0")}:00.000Z`,
  })),
  agents: [],
})!;
const cappedModel = buildAiCompanyDashboard(capped, parseHistoryFilters({}));
assert.match(cappedModel.activeBoundary, /100/);
assert.match(cappedModel.activeBoundary, /50/);
assert.equal(cappedModel.history.length, 20);
const secondPage = buildAiCompanyDashboard(capped, parseHistoryFilters({ history_offset: "20" }));
assert.equal(secondPage.history.length, 20);
assert.notEqual(secondPage.history[0]?.title, cappedModel.history[0]?.title);

const errorMarkup = renderToStaticMarkup(
  <AiCompanyDashboardView
    model={null}
    filters={parseHistoryFilters({})}
    sourceError="Company Core сейчас недоступен."
    onRefresh={() => undefined}
  />,
);
assert.match(errorMarkup, /Company Core недоступен/);
assert.match(errorMarkup, /Нулевая активность не показана/);
assert.doesNotMatch(errorMarkup, /Роли в работе/);
assert.match(errorMarkup, /Свежесть: нет данных/);

const liveMarkup = renderToStaticMarkup(
  <AiCompanyDashboardView model={liveModel} filters={parseHistoryFilters({ period: "week" })} sourceError={null} onRefresh={() => undefined} />,
);
assert.match(liveMarkup, /data-section="now"/);
assert.match(liveMarkup, /b01cd5d3-052b-4e21-9236-184b3c5f2a5e/);
assert.match(liveMarkup, /data-connection="not_connected"/);
assert.match(liveMarkup, /data-connection="online"/);
assert.match(liveMarkup, /data-connection="no_fresh_data"/);
assert.match(liveMarkup, /Нужно решение/);
assert.match(liveMarkup, /История блокировок/);
assert.match(liveMarkup, /Историческая блокировка/);
assert.doesNotMatch(liveMarkup.slice(0, liveMarkup.indexOf("История блокировок")), /Старый блокер уже снят/);
assert.match(liveMarkup, /grid-cols-2/);
assert.match(liveMarkup, /lg:grid-cols-2/);
assert.doesNotMatch(liveMarkup, /lg:grid-cols-3/);
assert.match(liveMarkup, /data-compact-row=/);
assert.match(liveMarkup, /period=week/);
assert.doesNotMatch(liveMarkup, /api_key|must-not-leak|Bearer /);

const contract = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  tasks: [
    {
      id: "contract-shape",
      title: "Имена контракта статуса",
      status: "in_progress",
      priority: "p1",
      role: "engineering",
      stage: "review",
      created_at: "2026-10-06T18:00:00.000Z",
      received_at: "2026-10-06T18:05:00.000Z",
      started_at: "2026-10-06T18:10:00.000Z",
      completed_at: null,
      last_event_at: "2026-10-07T06:40:00.000Z",
      last_event: "событие контракта",
      progress: null,
      percent: 55,
      verified_progress: { done: 1, total: 2, formula: "не должно читаться", evidence_at: "2026-10-07T06:00:00.000Z" },
      executor: "cursor",
      next_action: "Ждать сохранённое proof",
      human_gate: null,
      blocked_reason: null,
      result_type: "engineering",
      executive_run: {
        done: true,
        production_verified: false,
        head_sha: headSha,
        ci: { status: "success", sha: headSha },
        independent_review: { verdict: "pass", sha: headSha },
        deploy: { status: "deployed" },
        production_proof: { status: "verified", url: "https://audiolad.ru/admin/ai-company" },
      },
    },
    {
      id: "contract-progress",
      title: "Прогресс из progress",
      status: "in_progress",
      role: "product",
      result_type: "document",
      started_at: "2026-10-02T10:00:00.000Z",
      progress: { done: 2, total: 5, formula: "проверенные пункты", evidence_at: "2026-10-06T12:00:00.000Z", percent: 99 },
    },
  ],
  tasks_page: { complete: true },
  agents: [],
  executors: [],
  heartbeats: [],
  recent_events: [
    { event_type: "executive:note", task_id: "contract-shape", created_at: "2026-10-07T06:40:00.000Z" },
  ],
  events: [
    { event_type: "oriy:ignored", task_id: "contract-shape", created_at: "2026-10-07T06:41:00.000Z" },
  ],
  events_page: { complete: false },
  gates: [
    {
      id: "gate-contract",
      task_id: "contract-shape",
      reason: "Нужно решение по контракту",
      decision_owner: "Oriy",
      request: "Сверить имена",
      next_action: "Орий подтверждает имена",
    },
  ],
  gates_history: [
    { id: "gate-old", reason: "Архивный контрактный блокер", decision_owner: "Oriy", archived: true },
  ],
  gates_complete: true,
  gates_history_complete: false,
  codex: { connection: "not_connected", authenticated: false, gate: "CODEX_ACCESS_TOKEN", pilot_ok: false, readiness_task_id: "contract-shape" },
  quotas: {
    codex: { source: "openai_usage", remaining: 1, limit: 10, reset_at: "2026-10-08T00:00:00.000Z", trustworthy: true },
    cursor: { source: "cursor_pool", remaining: 4, limit: 20, trustworthy: true },
  },
  coverage: {},
  costs: { amount_usd: 0 },
})!;
const contractModel = buildAiCompanyDashboard(contract, parseHistoryFilters({}));
const contractTask = contractModel.activeTasks.find((task) => task.taskId === "contract-shape");
assert.ok(contractTask);
assert.match(contractTask.progress, /прогресс пока не измерен/);
assert.doesNotMatch(contractTask.progress, /55|1 из 2/);
assert.equal(contractTask.executorLabel, "Cursor");
assert.match(contractTask.nextStep, /Ждать сохранённое proof/);
assert.match(contractTask.stage, /review/);
assert.equal(contractTask.engineering.dodSatisfied, false);
assert.match(contractTask.engineering.production, /production_verified = false/);
assert.doesNotMatch(contractTask.engineering.production, /audiolad\.ru/);
assert.equal(contract.events.some((event) => event.eventType === "oriy:ignored"), false);
assert.equal(contract.events.some((event) => event.eventType === "executive:note"), true);
const contractProgress = contractModel.activeTasks.find((task) => task.title === "Прогресс из progress");
assert.ok(contractProgress);
assert.match(contractProgress.progress, /2 из 5/);
assert.doesNotMatch(contractProgress.progress, /99/);
const contractGate = contractModel.decisions.find((gate) => gate.reason.includes("по контракту"));
assert.ok(contractGate);
assert.equal(contractGate.decisionOwner, "Oriy");
assert.equal(contractModel.decisions.some((gate) => gate.reason.includes("Архивный контрактный")), false);
assert.equal(contractModel.archivedBlockers.some((gate) => gate.reason.includes("Архивный контрактный")), true);
assert.match(contractModel.activeBoundary, /лента событий обрезана|событий/);
assert.match(contractModel.historyBoundary, /история обрезана/);
assert.match(contractModel.quotas.find((line) => line.id === "codex")!.value, /Остаток: 1 из 10/);
assert.equal(contractModel.executors.find((executor) => executor.id === "codex")!.connection, "not_connected");

const aliasEvents = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  tasks: [{ id: "alias-events", title: "Старое поле events", status: "in_progress", started_at: "2026-10-07T01:00:00.000Z" }],
  agents: [],
  events: [{ event_type: "progress", task_id: "alias-events", created_at: "2026-10-07T06:35:00.000Z" }],
})!;
assert.equal(aliasEvents.events.length, 1);

const core = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  tasks: [
    {
      id: "late",
      title: "Поздняя полученная",
      status: "queued",
      role: "product",
      producer_agent_slug: "engineering",
      received_at: "2026-10-07T06:00:00.000Z",
      created_at: "2026-10-07T01:00:00.000Z",
      active: true,
      progress: null,
      percent: 40,
      executor: { provider: "cursor", channel: "cursor", model: "grok-4.7", run_id: "run-late" },
      next_action: "Продолжить",
      last_event: { event_type: "progress", summary: "пишет", at: "2026-10-07T06:10:00.000Z" },
      events: [{ event_type: "task:note", created_at: "2026-10-07T06:12:00.000Z" }],
      events_complete: true,
    },
    { id: "early", title: "Ранняя полученная", status: "queued", role: "qa", received_at: "2026-10-07T02:00:00.000Z", active: true },
    { id: "same-a", title: "Ничья А", status: "queued", received_at: "2026-10-07T03:00:00.000Z", active: true },
    { id: "same-b", title: "Ничья Б", status: "queued", received_at: "2026-10-07T03:00:00.000Z", active: true },
    { id: "no-date", title: "Без даты получения", status: "queued", created_at: "2026-10-07T05:00:00.000Z", updated_at: "2026-10-07T06:30:00.000Z", active: true },
    { id: "created-late", title: "Создана позже", status: "queued", created_at: "2026-10-07T04:00:00.000Z", active: false },
    { id: "created-early", title: "Создана раньше", status: "queued", created_at: "2026-10-07T01:30:00.000Z", active: false },
    { id: "done-late", title: "Закрыта позже", status: "done", result_type: "document", completed_at: "2026-10-07T05:30:00.000Z", active: false },
    { id: "done-early", title: "Закрыта раньше", status: "done", result_type: "document", completed_at: "2026-10-07T01:00:00.000Z", active: false },
    {
      id: "sha-ok",
      title: "Точный SHA",
      status: "in_progress",
      role: "engineering",
      result_type: "engineering",
      active: true,
      progress: { done: 3, total: 3, formula: "пункты", evidence_at: "2026-10-07T06:00:00.000Z" },
      executive_run: {
        ci_status: "success",
        review_status: "pass",
        review_sha: headSha,
        deploy_status: "deployed",
        head_sha: headSha,
        commit_sha: headSha,
        production_verified: true,
        production_proof: { verified: true, sha: headSha, evidence_at: "2026-10-07T06:20:00.000Z", source: "bridge" },
        done: true,
      },
    },
    {
      id: "sha-bad",
      title: "Чужой SHA",
      status: "in_progress",
      role: "engineering",
      result_type: "engineering",
      active: true,
      progress: { done: 3, total: 3, formula: "пункты", evidence_at: "2026-10-07T06:00:00.000Z" },
      executive_run: {
        ci_status: "success",
        review_status: "pass",
        review_sha: otherSha,
        deploy_status: "deployed",
        head_sha: headSha,
        done: true,
        production_verified: true,
        production_proof: { verified: true, sha: otherSha, evidence_at: "2026-10-07T06:20:00.000Z", source: "bridge" },
      },
    },
    {
      id: "orch",
      title: "Только executive",
      status: "in_progress",
      role: "orchestrator",
      active: true,
      executor: { provider: "executive", channel: "executive", model: "grok" },
    },
  ],
  tasks_page: {
    active_complete: true,
    history_complete: false,
    history_next_before: "2026-10-01T00:00:00.000Z",
    history_limit: 20,
  },
  recent_events: [],
  events_page: { complete: true },
  gates: [
    {
      id: "CODEX_ACCESS_TOKEN",
      task_id: "late",
      reason: "CODEX_ACCESS_TOKEN: нужен новый доступ",
      decision_owner: "sergey",
      request: "Выдать токен Codex",
      next_action: "Сергей решает доступ",
      kind: "credential",
    },
    {
      id: "english",
      task_id: "early",
      reason: "Missing execution context",
      decision_owner: "oriy",
      next_action: "Восстановить контекст",
    },
    {
      id: "proof-pending",
      task_id: "sha-bad",
      reason: "production proof pending",
      decision_owner: "oriy",
      next_action: "Дождаться сохранённого proof",
    },
  ],
  gates_history: [
    { id: "old-639", task_id: "done-early", reason: "Историческая блокировка выпуска 639", decision_owner: "oriy", archived: true },
  ],
  agents: [{ slug: "qa", role: "qa", connection: "free", connection_freshness_at: "2026-10-07T06:00:00.000Z" }],
  executors: [
    { provider: "cursor", connection: "working", freshness_at: "2026-10-07T06:30:00.000Z", run_id: "run-late" },
  ],
  quotas: {
    codex: { remaining: 3, limit: 9, source: "openai_usage", trustworthy: false, reset_at: "2026-10-08T00:00:00.000Z" },
  },
  costs: { confirmed: false, source: "ledger", amount_usd: 0 },
})!;
const coreModel = buildAiCompanyDashboard(core, parseHistoryFilters({}));
assert.deepEqual(
  coreModel.todayReceived.map((row) => row.title),
  ["Поздняя полученная", "Ничья А", "Ничья Б", "Ранняя полученная"],
);
assert.equal(coreModel.todayReceived.some((row) => row.title === "Без даты получения"), false);
assert.deepEqual(
  coreModel.todayCreated.map((row) => row.title),
  ["Без даты получения", "Создана позже", "Создана раньше"],
);
assert.deepEqual(
  coreModel.todayCompleted.map((row) => row.title),
  ["Закрыта позже", "Закрыта раньше"],
);
const late = coreModel.activeTasks.find((task) => task.taskId === "late");
assert.ok(late);
assert.match(late.functionalRole, /Продуктовый/);
assert.equal(late.executorLabel, "Cursor");
assert.match(late.executorNote, /не отдельный запуск xAI/);
assert.match(late.progress, /прогресс пока не измерен/);
assert.match(late.lastEvent, /progress: пишет/);
const orch = coreModel.activeTasks.find((task) => task.title === "Только executive");
assert.ok(orch);
assert.equal(orch.executorLabel, "Grok");
assert.match(orch.executorNote, /оркестрация/);
assert.equal(core.events.some((event) => event.eventType === "task:note"), true);
const shippedSha = coreModel.history.find((item) => item.title === "Точный SHA");
assert.ok(shippedSha);
assert.match(shippedSha.progress, /100%/);
assert.match(shippedSha.engineering.production, new RegExp(headSha));
assert.equal(shippedSha.stageBadge.label, "Завершена");
const badSha = coreModel.activeTasks.find((task) => task.title === "Чужой SHA");
assert.ok(badSha);
assert.equal(badSha.detail.stageBadge.label, "Проверяется на сайте");
assert.notEqual(badSha.detail.stageBadge.label, "Завершена");
assert.notEqual(orch.detail.stageBadge.label, "В работе");
assert.equal(orch.detail.stageBadge.label, "Нет свежих данных");
assert.equal(late.detail.stageBadge.label, "Нужно решение");
assert.match(late.detail.stageBadge.detail ?? "", /^Сергей:/);
assert.doesNotMatch(late.detail.stageBadge.detail ?? "", /Oriy:/);
assert.equal(badSha.engineering.dodSatisfied, false);
assert.match(badSha.progress, /100% не ставится/);
assert.match(badSha.engineering.independentReview, /другого SHA/);
const tokenGate = coreModel.decisions.find((gate) => gate.reason.includes("новый доступ"));
assert.ok(tokenGate);
assert.equal(tokenGate.decisionOwner, "Сергей");
assert.match(tokenGate.nextAction, /Сергей решает доступ/);
assert.match(tokenGate.taskTitle, /Поздняя полученная/);
const englishGate = coreModel.decisions.find((gate) => gate.taskTitle === "Ранняя полученная");
assert.ok(englishGate);
assert.equal(englishGate.decisionOwner, "Oriy");
assert.match(englishGate.reason, /контекста исполнения/);
assert.doesNotMatch(englishGate.reason, /Missing execution context/);
const pendingGate = coreModel.decisions.find((gate) => gate.taskTitle === "Чужой SHA");
assert.ok(pendingGate);
assert.match(pendingGate.reason, /не считается закрытой/);
assert.doesNotMatch(pendingGate.reason, /production proof pending/);
assert.equal(coreModel.decisions.some((gate) => gate.reason.includes("639")), false);
const historic = coreModel.archivedBlockers.find((gate) => gate.reason.includes("639"));
assert.ok(historic);
assert.equal(historic.historical, true);
assert.equal(coreModel.quotas.find((line) => line.id === "codex")!.value, "Нет данных");
assert.equal(coreModel.quotas.find((line) => line.id === "legacy")!.value, "Нет данных");
assert.equal(coreModel.historyNextCursor, "2026-10-01T00:00:00.000Z");
assert.match(coreModel.historyBoundary, /история обрезана/);
assert.equal(coreModel.executors.find((executor) => executor.id === "cursor")!.connectionLabel, "работает");
assert.equal(coreModel.executors.find((executor) => executor.id === "cursor")!.runId, "run-late");
assert.match(coreModel.agents.find((agent) => agent.slug === "qa")!.stateLabel, /Простаивает|свободен|нет свежих данных|Ожидает/);

const stages = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  agents: [],
  tasks: [
    {
      id: "stale-dispatch",
      title: "Старая отправка без старта",
      status: "executive_dispatched",
      last_event_at: "2026-10-07T04:00:00.000Z",
      last_event: { event_type: "executive_dispatched", summary: "run queued", at: "2026-10-07T04:00:00.000Z" },
    },
    {
      id: "fresh-dispatch",
      title: "Свежая отправка",
      status: "executive_dispatched",
      last_event_at: "2026-10-07T06:20:00.000Z",
    },
    {
      id: "no-start",
      title: "Без подтверждённого старта",
      status: "in_progress",
      last_event_at: "2026-10-07T06:30:00.000Z",
    },
    {
      id: "started",
      title: "Старт подтверждён",
      status: "in_progress",
      started_at: "2026-10-07T05:00:00.000Z",
      last_event_at: "2026-10-07T06:20:00.000Z",
      result_type: "engineering",
    },
    {
      id: "stale-start",
      title: "Старт без свежего события",
      status: "in_progress",
      started_at: "2026-10-07T04:00:00.000Z",
      last_event_at: "2026-10-07T04:10:00.000Z",
      result_type: "engineering",
      progress: { done: 2, total: 5, formula: "старый прогресс", evidence_at: "2026-10-07T04:10:00.000Z" },
    },
    {
      id: "newer-run",
      title: "Свежий запуск после старой отправки",
      status: "executive_dispatched",
      last_event_at: "2026-10-07T04:00:00.000Z",
      executive_status: "progress",
      executive_run: { last_event: "progress", last_event_at: "2026-10-07T06:25:00.000Z" },
    },
    {
      id: "in-review",
      title: "Ждёт независимую проверку",
      status: "in_review",
      started_at: "2026-10-07T05:00:00.000Z",
      result_type: "engineering",
    },
    {
      id: "merged-794",
      title: "Слито и не выпущено",
      status: "merged",
      github_issue_number: 794,
      result_type: "engineering",
      merged: true,
      release_hold: "Слито в main, проверка health ещё не записана",
      executive_run: {
        merged: true,
        head_sha: headSha,
        ci_status: "success",
        review_status: "pass",
        review_sha: headSha,
        deploy_status: "pending",
        production_verified: false,
        done: true,
      },
    },
    {
      id: "merged-795",
      title: "Слито без просьбы выпускать",
      status: "merged",
      github_issue_number: 795,
      result_type: "engineering",
      hold_reason: "Сергей, деплоим?",
      executive_run: { merged: "yes", deploy_status: "not_started", production_verified: false, done: true },
    },
    {
      id: "on-site",
      title: "Выпуск проверяется",
      status: "in_progress",
      result_type: "engineering",
      started_at: "2026-10-07T01:00:00.000Z",
      executive_run: {
        head_sha: headSha,
        deploy_status: "deployed",
        production_verified: false,
      },
    },
    {
      id: "verified-site",
      title: "Проверка на сайте сохранена",
      status: "in_progress",
      result_type: "engineering",
      started_at: "2026-10-07T01:00:00.000Z",
      completed_at: "2026-10-07T06:20:00.000Z",
      progress: { done: 4, total: 4, formula: "критерии DoD", evidence_at: "2026-10-07T06:20:00.000Z" },
      executive_run: {
        head_sha: headSha,
        ci_status: "success",
        review_status: "pass",
        review_sha: headSha,
        deploy_status: "deployed",
        production_verified: true,
        production_proof: { verified: true, sha: headSha, evidence_at: "2026-10-07T06:25:00.000Z", source: "bridge" },
        done: true,
      },
    },
    {
      id: "cancelled-task",
      title: "Отменённая постановка",
      status: "cancelled",
      result_type: "document",
    },
    {
      id: "need-sergey",
      title: "Короткое решение",
      status: "blocked",
      blocked_reason: "Нет правки обложки",
      decision_owner: "sergey",
      result_type: "document",
    },
    {
      id: "blocked-plain",
      title: "Блок без владельца",
      status: "blocked",
      blocked_reason: "Нет файла обложки",
    },
    {
      id: "doc-accepted",
      title: "Документ принят",
      status: "accepted",
      result_type: "document",
      received_at: "2026-10-07T02:00:00.000Z",
      completed_at: "2026-10-07T06:10:00.000Z",
      updated_at: "2026-10-06T01:00:00.000Z",
    },
    {
      id: "doc-delivered",
      title: "Исследование сдано событием",
      status: "in_progress",
      result_type: "research",
      events: [{ event_type: "accepted", created_at: "2026-10-07T06:15:00.000Z" }],
    },
    {
      id: "unknown-completed",
      title: "Закрыто без времени",
      status: "done",
      result_type: "document",
      updated_at: "2026-10-07T06:30:00.000Z",
    },
    {
      id: "backend-then-frontend",
      title: "Старый backend proof и неготовый frontend",
      status: "in_progress",
      result_type: "engineering",
      operating_stage: "in_review",
      executive_run: {
        head_sha: headSha,
        commit_sha: otherSha,
        review_status: "independent_pass",
        review_sha: headSha,
        deploy_status: "merged_not_deployed_hold_oriy_6d560a68",
        production_verified: false,
        production_proof: { verified: true, sha: otherSha, source: "backend", evidence_at: "2026-10-06T12:00:00.000Z" },
        done: true,
      },
    },
    {
      id: "sha-map",
      title: "Разные SHA проверки и выпуска",
      status: "in_progress",
      result_type: "engineering",
      started_at: "2026-10-07T06:00:00.000Z",
      executive_run: {
        head_sha: headSha,
        commit_sha: otherSha,
        ci_status: "success",
        review_status: "independent_pass",
        review_sha: headSha,
        deploy_status: "deployed",
        production_verified: true,
        production_proof: { verified: true, sha: otherSha, evidence_at: "2026-10-07T06:20:00.000Z", source: "bridge" },
      },
    },
  ],
})!;
const stageModel = buildAiCompanyDashboard(stages, parseHistoryFilters({}));
const stageRows = [
  ...stageModel.activeTasks.map((task) => task.detail),
  ...stageModel.queue,
  ...stageModel.history,
  ...stageModel.todayReceived.map((row) => row.detail),
  ...stageModel.todayCompleted.map((row) => row.detail),
];
function stageOf(title: string) {
  const row = stageRows.find((item) => item.title === title);
  assert.ok(row, title);
  return row;
}
assert.equal(stageOf("Старая отправка без старта").stageBadge.label, "Нет свежих данных");
assert.equal(stageOf("Старая отправка без старта").stageBadge.tone, "stale");
assert.equal(stageOf("Свежая отправка").stageBadge.label, "В очереди");
assert.notEqual(stageOf("Свежая отправка").stageBadge.label, "В работе");
assert.equal(stageOf("Без подтверждённого старта").stageBadge.label, "Нет свежих данных");
assert.notEqual(stageOf("Без подтверждённого старта").stageBadge.label, "В работе");
assert.equal(stageOf("Старт подтверждён").stageBadge.label, "В работе");
const staleStart = stageOf("Старт без свежего события");
assert.equal(staleStart.stageBadge.label, "Нет свежих данных");
assert.match(staleStart.stageBadge.detail ?? "", /Последняя подтверждённая стадия: В работе/);
assert.notEqual(staleStart.stageBadge.label, "В работе");
assert.equal(stageOf("Свежий запуск после старой отправки").stageBadge.label, "В работе");
assert.notEqual(stageOf("Свежий запуск после старой отправки").stageBadge.label, "Нет свежих данных");
assert.equal(stageOf("Ждёт независимую проверку").stageBadge.label, "На проверке");
const waitingRelease = stageOf("Слито и не выпущено");
assert.equal(waitingRelease.stageBadge.label, "Ожидает выпуска");
assert.match(waitingRelease.stageBadge.detail ?? "", /проверка health/);
assert.match(waitingRelease.stageBadge.detail ?? "", /^Oriy:/);
assert.doesNotMatch(waitingRelease.stageBadge.detail ?? "", /деплоим/);
assert.equal(stageModel.history.some((item) => item.title === "Слито и не выпущено"), false);
assert.notEqual(waitingRelease.stageBadge.label, "Завершена");
const silentRelease = stageOf("Слито без просьбы выпускать");
assert.equal(silentRelease.stageBadge.label, "Ожидает выпуска");
assert.match(silentRelease.stageBadge.detail ?? "", /Выпуск на сайт не подтверждён/);
assert.match(silentRelease.stageBadge.detail ?? "", /^Oriy:/);
assert.doesNotMatch(`${silentRelease.stageBadge.label} ${silentRelease.stageBadge.detail}`, /деплоим|деплой/);
assert.equal(stageModel.history.some((item) => item.title === "Слито без просьбы выпускать"), false);
assert.equal(stageOf("Выпуск проверяется").stageBadge.label, "Проверяется на сайте");
const verified = stageOf("Проверка на сайте сохранена");
assert.equal(verified.stageBadge.label, "Завершена");
assert.match(verified.progress, /100%/);
assert.equal(stageModel.history.some((item) => item.title === "Проверка на сайте сохранена"), true);
assert.equal(stageOf("Отменённая постановка").stageBadge.label, "Отменена");
assert.equal(stageModel.history.some((item) => item.title === "Отменённая постановка"), false);
const sergeyDecision = stageOf("Короткое решение");
assert.equal(sergeyDecision.stageBadge.label, "Нужно решение");
assert.match(sergeyDecision.stageBadge.detail ?? "", /^Сергей: Нет правки обложки/);
assert.equal(stageOf("Блок без владельца").stageBadge.label, "Заблокирована");
assert.match(stageOf("Блок без владельца").stageBadge.detail ?? "", /Нет данных: Нет файла обложки/);

const stageMarkup = renderToStaticMarkup(
  <AiCompanyDashboardView model={stageModel} filters={parseHistoryFilters({})} sourceError={null} onRefresh={() => undefined} />,
);
assert.match(stageMarkup, /flex min-h-12 w-full max-w-full flex-wrap items-center/);
assert.match(stageMarkup, /aria-expanded="false"/);
assert.match(stageMarkup, /aria-controls="ai-company-panel-/);
assert.doesNotMatch(stageMarkup, /<summary[^>]*>Подробности/);
assert.doesNotMatch(stageMarkup, /<button[^>]*data-stage-badge/);
for (const tone of ["stale", "queue", "working", "review", "release", "site", "done", "cancelled", "decision", "blocked"] as const) {
  const span = stageMarkup.match(new RegExp(`<span(?=[^>]*data-stage-badge="${tone}")[^>]*>`));
  assert.ok(span, tone);
  assert.match(span[0], /whitespace-normal/);
  assert.match(span[0], /break-words/);
  assert.doesNotMatch(span[0], /truncate|overflow-hidden|whitespace-nowrap/);
}
const staleSpan = stageMarkup.match(/<span(?=[^>]*data-stage-badge="stale")[^>]*>[^<]*</);
assert.ok(staleSpan);
assert.match(staleSpan[0], /Нет свежих данных/);
assert.doesNotMatch(staleSpan[0], /executive_dispatched/);
const todayMarkup = stageMarkup.slice(stageMarkup.indexOf('data-section="today"'), stageMarkup.indexOf('data-section="queue"'));
assert.doesNotMatch(todayMarkup, /<summary[^>]*>Подробности/);
assert.match(todayMarkup, /aria-expanded="false"/);
assert.match(todayMarkup, /Идентификатор задачи/);
assert.match(todayMarkup, /Технический статус/);
assert.match(todayMarkup, /Текущий этап/);
const queueMarkup = stageMarkup.slice(stageMarkup.indexOf('data-section="queue"'), stageMarkup.indexOf('data-section="quotas"'));
assert.match(queueMarkup, /Технический статус/);
assert.match(queueMarkup, /executive_dispatched \(технический статус\)/);
assert.match(queueMarkup, /Текущий этап/);
const freshAt = queueMarkup.indexOf("Свежая отправка");
const freshButton = queueMarkup.slice(freshAt, queueMarkup.indexOf("</button>", freshAt));
assert.doesNotMatch(freshButton, /executive_dispatched/);
assert.doesNotMatch(freshButton, /Идентификатор задачи/);
assert.doesNotMatch(freshButton, /Технический статус/);
assert.match(stageMarkup, /data-stage-badge="release"[^>]*>Ожидает выпуска/);
assert.equal(stages.tasks.find((task) => task.id === "merged-794")?.merged, true);
assert.equal(stages.tasks.find((task) => task.id === "merged-794")?.executiveRun?.merged, true);
assert.match(stages.tasks.find((task) => task.id === "merged-794")?.releaseHold ?? "", /health/);
assert.equal(stages.tasks.find((task) => task.id === "merged-795")?.executiveRun?.merged, true);
assert.equal(stages.tasks.find((task) => task.id === "backend-then-frontend")?.stage, "in_review");
assert.equal(stages.tasks.find((task) => task.id === "sha-map")?.executiveRun?.mergeSha, otherSha);
assert.equal(stages.tasks.find((task) => task.id === "sha-map")?.executiveRun?.headSha, headSha);

const accepted = stageOf("Документ принят");
assert.equal(accepted.stageBadge.label, "Завершена");
assert.equal(accepted.stageBadge.tone, "done");
assert.equal(stageModel.activeTasks.some((task) => task.title === "Документ принят"), false);
assert.equal(stageModel.history.some((item) => item.title === "Документ принят"), true);
assert.equal(stageModel.todayCompleted.some((row) => row.title === "Документ принят"), true);
assert.ok(
  stageModel.todayCompleted.findIndex((row) => row.title === "Исследование сдано событием") <
    stageModel.todayCompleted.findIndex((row) => row.title === "Документ принят"),
);
const delivered = stageOf("Исследование сдано событием");
assert.equal(delivered.stageBadge.label, "Завершена");
assert.doesNotMatch(delivered.completedAt, /06\.10\.2026|updated/);
const unknownTime = stageOf("Закрыто без времени");
assert.equal(unknownTime.stageBadge.label, "Завершена");
assert.equal(unknownTime.stageBadge.detail, "Время завершения не сохранено");
assert.equal(unknownTime.completedAt, "Время завершения не сохранено");
assert.equal(stageModel.todayCompleted.some((row) => row.title === "Закрыто без времени"), false);
assert.equal(stageModel.history.some((item) => item.title === "Закрыто без времени"), true);
assert.equal(stageModel.activeTasks.some((task) => task.title === "Закрыто без времени"), false);
const partial = stageOf("Старый backend proof и неготовый frontend");
assert.equal(partial.stageBadge.label, "Ожидает выпуска");
assert.match(partial.stageBadge.detail ?? "", /^Oriy:/);
assert.equal(partial.engineering.dodSatisfied, false);
assert.notEqual(partial.stageBadge.label, "Завершена");
const shaMap = stageOf("Разные SHA проверки и выпуска");
assert.equal(shaMap.engineering.dodSatisfied, false);
assert.notEqual(shaMap.stageBadge.label, "Завершена");
assert.match(shaMap.engineering.independentReview, new RegExp(headSha));
assert.match(shaMap.engineering.independentReview, new RegExp(otherSha));
assert.match(shaMap.engineering.independentReview, /связь проверки с выпуском не подтверждена/);
assert.match(shaMap.engineering.production, /не совпадает/);
const releaseRows = stageModel.todayReceived.filter((row) => row.detail.stageBadge.label === "Ожидает выпуска");
assert.equal(releaseRows.length, 0);
const receivedTimes = stageModel.todayReceived.map((row) => row.timeLabel);
assert.deepEqual(receivedTimes, [...receivedTimes].sort((left, right) => (left < right ? 1 : left > right ? -1 : 0)));

const openedOnce = toggleOpenRow({}, "now:task-1");
assert.equal(openedOnce["now:task-1"], true);
assert.equal(toggleOpenRow(openedOnce, "now:task-1")["now:task-1"], false);
const storedRows = serializeOpenRows({ "now:task-1": true, "queue:task-2": false, "role:qa": true });
assert.deepEqual(parseOpenRows(storedRows), { "now:task-1": true, "role:qa": true });
assert.equal(parseOpenRows(storedRows)["queue:brand-new"], undefined);
assert.deepEqual(parseOpenRows("[]"), {});
assert.deepEqual(parseOpenRows("not-json"), {});
assert.equal(AI_COMPANY_OPEN_ROWS_KEY, "audiolad:ai-company:open-rows");
assert.equal(AI_COMPANY_SCROLL_KEY, "audiolad:ai-company:scroll");
const disclosureSource = readFileSync("src/lib/admin/ai-company-disclosure.ts", "utf8");
assert.match(disclosureSource, /sessionStorage/);
assert.match(disclosureSource, /scrollTo/);
assert.match(dashboardSource, /useAiCompanyDisclosureState/);
assert.doesNotMatch(dashboardSource, /<summary[^>]*>Подробности/);

const activeAt = liveMarkup.indexOf("Сделать рабочее табло ИИ-компании");
const activeButton = liveMarkup.slice(activeAt, liveMarkup.indexOf("</button>", activeAt));
assert.doesNotMatch(activeButton, /b01cd5d3-052b-4e21-9236-184b3c5f2a5e/);
assert.doesNotMatch(activeButton, /Технический статус|Выкладка \(deploy\)|Независимая проверка/);
const activePanel = liveMarkup.indexOf('id="ai-company-panel-now-', activeAt);
assert.ok(activePanel > liveMarkup.indexOf("</button>", activeAt));

const openedMarkup = renderToStaticMarkup(
  <AiCompanyDashboardView
    model={stageModel}
    filters={parseHistoryFilters({})}
    sourceError={null}
    onRefresh={() => undefined}
    openDetails={{ "queue:fresh-dispatch": true }}
    onToggleDetail={() => undefined}
  />,
);
const openedQueue = openedMarkup.slice(openedMarkup.indexOf('data-section="queue"'), openedMarkup.indexOf('data-section="quotas"'));
assert.match(openedQueue, /aria-expanded="true"/);
assert.match(openedQueue, /id="ai-company-panel-queue-fresh-dispatch"/);
assert.doesNotMatch(openedQueue, /id="ai-company-panel-queue-fresh-dispatch"[^>]*hidden/);
const freshOpen = openedQueue.indexOf("Свежая отправка");
const freshOpenButton = openedQueue.slice(openedQueue.lastIndexOf("<button", freshOpen), openedQueue.indexOf("</button>", freshOpen));
assert.match(freshOpenButton, /aria-expanded="true"/);
assert.doesNotMatch(freshOpenButton, /executive_dispatched/);
const nowOpen = openedMarkup.slice(openedMarkup.indexOf('data-section="now"'), openedMarkup.indexOf('data-section="executors"'));
const staleAt = nowOpen.indexOf("Старая отправка без старта");
const staleButton = nowOpen.slice(nowOpen.lastIndexOf("<button", staleAt), nowOpen.indexOf("</button>", staleAt));
assert.match(staleButton, /aria-expanded="false"/);
assert.match(staleButton, /Нет свежих данных/);
assert.doesNotMatch(staleButton, /executive_dispatched/);
assert.doesNotMatch(staleButton, /Технический статус|Идентификатор задачи/);
assert.doesNotMatch(staleButton, /Скопировать данные/);
assert.match(nowOpen, /aria-label="Скопировать данные задачи"/);

const plainCopy = formatAiCompanyTaskCopy({
  title: "Обычная задача",
  taskId: "copy-plain",
  runId: "bc-copy-plain",
  brief: null,
  stageLabel: "В очереди",
  stageDetail: null,
  executor: "Cursor",
  decisionKind: "none",
  decisionOwner: null,
  reason: null,
  requiredDecision: null,
  requiredAction: null,
  createdAt: "Нет данных",
  receivedAt: "07.10.2026, 09:00",
  startedAt: "Нет данных",
  lastEventAt: "07.10.2026, 09:10",
  completedAt: "Нет данных",
  snapshotAt: "07.10.2026, 09:39 МСК",
  result: "Нет данных",
  nextStep: "Сверить контракт",
  links: [{ label: "PR", href: "https://github.com/Audiolad/audiolad/pull/801" }],
  note: null,
});
assert.match(plainCopy, /Отдельное решение по этой задаче в снимке не записано/);
assert.match(plainCopy, /Идентификатор запуска: bc-copy-plain/);
assert.match(plainCopy, /PR: https:\/\/github.com\/Audiolad\/audiolad\/pull\/801/);
assert.doesNotMatch(plainCopy, /Нужно решение\./);
assert.doesNotMatch(plainCopy, /Founder Gate/);

const blockedCopy = formatAiCompanyTaskCopy({
  title: "Блок без владельца",
  taskId: "copy-blocked",
  runId: null,
  brief: "Короткий блок",
  stageLabel: "Заблокирована",
  stageDetail: "Нет данных: Нет файла",
  executor: "Нет данных",
  decisionKind: "blocked",
  decisionOwner: null,
  reason: "Нет файла",
  requiredDecision: null,
  requiredAction: null,
  createdAt: "Нет данных",
  receivedAt: "Нет данных",
  startedAt: "Нет данных",
  lastEventAt: "Нет данных",
  completedAt: "Нет данных",
  snapshotAt: "07.10.2026, 09:39 МСК",
  result: "Нет данных",
  nextStep: null,
  links: [],
  note: null,
});
assert.match(blockedCopy, /Задача заблокирована/);
assert.match(blockedCopy, /Кто вправе его принять: Нет данных/);
assert.match(blockedCopy, /Постановка:\nКороткий блок/);
assert.doesNotMatch(blockedCopy, /Кто вправе его принять: Oriy/);

const oriyCopy = formatAiCompanyTaskCopy({
  title: "Решение Ория",
  taskId: "copy-oriy",
  runId: "bc-oriy",
  brief: "Постановка для Ория",
  stageLabel: "Нужно решение",
  stageDetail: "Oriy: Нужно подтвердить формулировку каталога",
  executor: "Нет данных",
  decisionKind: "decision",
  decisionOwner: "Oriy",
  reason: "Нужно подтвердить формулировку каталога",
  requiredDecision: "Подтвердить текст",
  requiredAction: "Орий отвечает в задаче",
  createdAt: "Нет данных",
  receivedAt: "Нет данных",
  startedAt: "Нет данных",
  lastEventAt: "Нет данных",
  completedAt: "Нет данных",
  snapshotAt: "07.10.2026, 09:39 МСК",
  result: "Нет данных",
  nextStep: null,
  links: [],
  note: null,
});
assert.match(oriyCopy, /Нужно решение\./);
assert.match(oriyCopy, /Какое решение требуется: Подтвердить текст/);
assert.match(oriyCopy, /Кто вправе его принять: Oriy/);
assert.match(oriyCopy, /Почему: Нужно подтвердить формулировку каталога/);
assert.doesNotMatch(oriyCopy, /Founder Gate/);
assert.doesNotMatch(oriyCopy, /Кто вправе его принять: Сергей/);

const founderCopy = formatAiCompanyTaskCopy({
  title: "Решение Сергея",
  taskId: "copy-sergey",
  runId: null,
  brief: "Постановка для Сергея",
  stageLabel: "Нужно решение",
  stageDetail: "Сергей: Нет правки обложки",
  executor: "Нет данных",
  decisionKind: "decision",
  decisionOwner: "Сергей",
  reason: "Нет правки обложки",
  requiredDecision: "Приложить файл обложки",
  requiredAction: "Сергей подтверждает файл",
  createdAt: "Нет данных",
  receivedAt: "Нет данных",
  startedAt: "Нет данных",
  lastEventAt: "Нет данных",
  completedAt: "Нет данных",
  snapshotAt: "07.10.2026, 09:39 МСК",
  result: "Нет данных",
  nextStep: null,
  links: [],
  note: null,
});
assert.match(founderCopy, /Кто вправе его принять: Сергей/);
assert.match(founderCopy, /Какое решение требуется: Приложить файл обложки/);
assert.doesNotMatch(founderCopy, /Кто вправе его принять: Oriy/);
assert.doesNotMatch(founderCopy, /Founder Gate/);

const missingCopy = formatAiCompanyTaskCopy({
  title: "Пустая постановка",
  taskId: "copy-empty",
  runId: "not a run id",
  brief: null,
  stageLabel: "В очереди",
  stageDetail: null,
  executor: "Нет данных",
  decisionKind: "none",
  decisionOwner: null,
  reason: null,
  requiredDecision: null,
  requiredAction: null,
  createdAt: "Нет данных",
  receivedAt: "Нет данных",
  startedAt: "Нет данных",
  lastEventAt: "Нет данных",
  completedAt: "Нет данных",
  snapshotAt: "Нет данных",
  result: "Нет данных",
  nextStep: null,
  links: [{ label: "Внутреннее", href: "http://files.example/secret" }],
  note: null,
});
assert.match(missingCopy, /Идентификатор запуска: Нет данных/);
assert.match(missingCopy, /Постановка:\nНет данных/);
assert.match(missingCopy, /Снимок источника: Нет данных/);
assert.doesNotMatch(missingCopy, /http:\/\/files\.example/);

const secretBrief = "Текст до секрета. api_key=super-secret-value CODEX_ACCESS_TOKEN=tok_live_123 user@example.com текст после.";
const secretCopy = formatAiCompanyTaskCopy({
  title: "Задача с секретом в постановке",
  taskId: "copy-secret",
  runId: "bc-secret",
  brief: secretBrief,
  stageLabel: "В очереди",
  stageDetail: null,
  executor: "Нет данных",
  decisionKind: "none",
  decisionOwner: null,
  reason: null,
  requiredDecision: null,
  requiredAction: null,
  createdAt: "Нет данных",
  receivedAt: "Нет данных",
  startedAt: "Нет данных",
  lastEventAt: "Нет данных",
  completedAt: "Нет данных",
  snapshotAt: "07.10.2026, 09:39 МСК",
  result: "Нет данных",
  nextStep: null,
  links: [],
  note: null,
});
assert.match(secretCopy, /Текст до секрета/);
assert.match(secretCopy, /текст после/);
assert.doesNotMatch(secretCopy, /super-secret-value|tok_live_123|user@example.com/);

const longBrief = `Первая строка постановки.\n\n${"А".repeat(600)}\nКОНЕЦ-ПОСТАНОВКИ`;
const copyFixture = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  tasks: [
    {
      id: "copy-plain",
      title: "Обычная задача табло",
      status: "queued",
      executor: "cursor",
      brief: longBrief,
      executive_run: {
        run_id: "bc-copy-plain",
        pr_url: "https://github.com/Audiolad/audiolad/pull/801",
      },
    },
    {
      id: "copy-oriy",
      title: "Решение Ория",
      status: "blocked",
      blocked_reason: "Нужно подтвердить формулировку каталога",
      decision_owner: "oriy",
      request: "Подтвердить текст",
      brief: "Постановка для Ория",
    },
    {
      id: "copy-sergey",
      title: "Решение Сергея",
      status: "blocked",
      blocked_reason: "Нет правки обложки",
      decision_owner: "Sergey",
      request: "Приложить файл обложки",
      next_action: "Сергей подтверждает файл",
      brief: "Постановка для Сергея",
    },
    {
      id: "copy-blocked",
      title: "Блок без владельца",
      status: "blocked",
      blocked_reason: "Нет файла",
    },
    {
      id: "copy-secret",
      title: "Задача с секретом в постановке",
      status: "queued",
      brief: secretBrief,
    },
  ],
  gates: [
    {
      id: "g-oriy",
      task_id: "copy-oriy",
      reason: "Нужно подтвердить формулировку каталога",
      decision_owner: "oriy",
      request: "Подтвердить текст",
      next_action: "Орий отвечает в задаче",
    },
    {
      id: "g-sergey",
      task_id: "copy-sergey",
      reason: "Нет правки обложки",
      decision_owner: "Sergey",
      request: "Приложить файл обложки",
      next_action: "Сергей подтверждает файл",
    },
  ],
})!;
const copyModel = buildAiCompanyDashboard(copyFixture, parseHistoryFilters({}));
const plainTask = [...copyModel.queue, ...copyModel.activeTasks.map((task) => task.detail)].find((item) => item.taskId === "copy-plain");
assert.ok(plainTask);
assert.match(plainTask.copyText, /Идентификатор запуска: bc-copy-plain/);
assert.match(plainTask.copyText, /КОНЕЦ-ПОСТАНОВКИ/);
assert.match(plainTask.copyText, /Первая строка постановки\.\n/);
assert.doesNotMatch(plainTask.brief, /\n/);
assert.match(plainTask.copyText, /PR: https:\/\/github.com\/Audiolad\/audiolad\/pull\/801/);
const oriyTask = [...copyModel.queue, ...copyModel.activeTasks.map((task) => task.detail)].find((item) => item.taskId === "copy-oriy");
const oriyGate = copyModel.decisions.find((gate) => gate.taskTitle === "Решение Ория");
assert.ok(oriyTask && oriyGate);
assert.equal(oriyGate.decisionOwner, "Oriy");
assert.equal(oriyTask.copyText, oriyGate.copyText);
assert.match(oriyTask.copyText, /Кто вправе его принять: Oriy/);
assert.doesNotMatch(oriyTask.copyText, /Founder Gate/);
const sergeyTask = [...copyModel.queue, ...copyModel.activeTasks.map((task) => task.detail)].find((item) => item.taskId === "copy-sergey");
const sergeyGate = copyModel.decisions.find((gate) => gate.taskTitle === "Решение Сергея");
assert.ok(sergeyTask && sergeyGate);
assert.equal(sergeyGate.decisionOwner, "Сергей");
assert.equal(sergeyTask.copyText, sergeyGate.copyText);
assert.match(sergeyTask.copyText, /Кто вправе его принять: Сергей/);
assert.match(sergeyTask.copyText, /Какое решение требуется: Приложить файл обложки/);
assert.doesNotMatch(sergeyTask.copyText, /Кто вправе его принять: Oriy/);
const blockedTask = [...copyModel.queue, ...copyModel.activeTasks.map((task) => task.detail)].find((item) => item.taskId === "copy-blocked");
assert.ok(blockedTask);
assert.equal(blockedTask.stageBadge.label, "Заблокирована");
assert.match(blockedTask.copyText, /Задача заблокирована/);
assert.match(blockedTask.copyText, /Кто вправе его принять: Нет данных/);
const secretTask = [...copyModel.queue, ...copyModel.activeTasks.map((task) => task.detail)].find((item) => item.taskId === "copy-secret");
assert.ok(secretTask);
assert.doesNotMatch(secretTask.copyText, /super-secret-value|tok_live_123|user@example.com/);
assert.match(secretTask.copyText, /текст после/);

const copyMarkup = renderToStaticMarkup(
  <AiCompanyDashboardView model={copyModel} filters={parseHistoryFilters({})} sourceError={null} onRefresh={() => undefined} />,
);
const plainAt = copyMarkup.indexOf("Обычная задача табло");
const plainToggle = copyMarkup.slice(copyMarkup.lastIndexOf("<button", plainAt), copyMarkup.indexOf("</button>", plainAt));
assert.doesNotMatch(plainToggle, /Скопировать данные/);
assert.match(copyMarkup, /aria-label="Скопировать данные задачи"/);

const acceptanceStatus = parseCompanyStatus({
  generated_at: "2026-10-07T18:00:00.000Z",
  tasks: [
    {
      id: "presented-doc",
      title: "Документ ждёт владельца",
      status: "done",
      result_type: "document",
      completed_at: "2026-10-07T17:00:00.000Z",
      updated_at: "2026-10-07T17:40:00.000Z",
      owner_acceptance: {
        state: "pending",
        presented_at: "2026-10-07T17:10:00.000Z",
        result_version: "result-4",
        result_sha: "abc1234def",
      },
    },
    {
      id: "accepted-doc",
      title: "Документ уже принят",
      status: "done",
      result_type: "document",
      completed_at: "2026-10-07T16:00:00.000Z",
      owner_acceptance: {
        state: "accepted",
        presented_at: "2026-10-07T15:00:00.000Z",
        accepted_at: "2026-10-07T16:30:00.000Z",
        actor: "sergey",
        result_version: "result-2",
      },
    },
    {
      id: "returned-doc",
      title: "Документ вернули",
      status: "done",
      result_type: "document",
      completed_at: "2026-10-07T12:00:00.000Z",
      next_action: "Исправить обложку",
      decision_owner: "Sergey",
      owner_acceptance: {
        state: "returned",
        return_note: "На сайте кнопки нет",
        returned_at: "2026-10-07T16:40:00.000Z",
      },
    },
    {
      id: "routine-low",
      title: "Обычный выпуск",
      status: "done",
      result_type: "engineering",
      risk: "low",
      completed_at: "2026-10-07T17:20:00.000Z",
      executive_run: {
        head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ci_status: "success",
        review_status: "independent_pass",
        review_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        deploy_status: "deployed",
        production_verified: true,
        production_proof: { verified: true, sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", evidence_at: "2026-10-07T17:20:00.000Z" },
      },
      owner_acceptance: { state: "pending", presented_at: "2026-10-07T17:20:00.000Z" },
    },
    {
      id: "untagged-done",
      title: "Закрыто без приёмки в снимке",
      status: "accepted",
      result_type: "document",
      completed_at: "2026-10-07T11:00:00.000Z",
    },
  ],
})!;
const acceptanceModel = buildAiCompanyDashboard(acceptanceStatus, parseHistoryFilters({}));
const presented = acceptanceModel.ownerReview.find((item) => item.taskId === "presented-doc");
assert.ok(presented);
assert.equal(presented.stageBadge.label, "На проверке");
assert.equal(presented.stageBadge.tone, "acceptance");
assert.match(presented.stageBadge.detail ?? "", /не PR/);
assert.equal(presented.acceptance?.resultVersion, "result-4");
assert.equal(presented.acceptance?.resultSha, "abc1234def");
assert.equal(acceptanceModel.history.some((item) => item.taskId === "presented-doc"), false);
assert.equal(acceptanceModel.acceptedArchive.some((item) => item.taskId === "presented-doc"), false);
assert.doesNotMatch(presented.stageBadge.detail ?? "", /17:40|updated/);
const acceptedRow = acceptanceModel.acceptedArchive.find((item) => item.taskId === "accepted-doc");
assert.ok(acceptedRow);
assert.equal(acceptedRow.stageBadge.label, "Принята");
assert.match(acceptedRow.stageBadge.detail ?? "", /07\.10\.2026, 19:30/);
assert.equal(acceptanceModel.history.some((item) => item.taskId === "accepted-doc"), false);
assert.equal(acceptanceModel.ownerReview.some((item) => item.taskId === "accepted-doc"), false);
const returned = [...acceptanceModel.queue, ...acceptanceModel.activeTasks.map((item) => item.detail)].find(
  (item) => item.taskId === "returned-doc",
);
assert.ok(returned);
assert.notEqual(returned.stageBadge.label, "Завершена");
assert.notEqual(returned.stageBadge.label, "Принята");
assert.match(returned.stageBadge.detail ?? "", /На сайте кнопки нет/);
assert.equal(returned.acceptance?.nextAction, "Исправить обложку");
assert.equal(returned.acceptance?.decisionOwner, "Сергей");
assert.equal(acceptanceModel.acceptedArchive.some((item) => item.taskId === "returned-doc"), false);
const routine = acceptanceModel.history.find((item) => item.taskId === "routine-low");
assert.ok(routine);
assert.equal(routine.stageBadge.label, "Завершена");
assert.equal(routine.acceptance?.applicable, false);
assert.equal(acceptanceModel.ownerReview.some((item) => item.taskId === "routine-low"), false);
const untagged = acceptanceModel.history.find((item) => item.taskId === "untagged-done");
assert.ok(untagged);
assert.equal(untagged.stageBadge.label, "Завершена");
assert.equal(untagged.acceptance, null);

const acceptanceMarkup = renderToStaticMarkup(
  <AiCompanyDashboardView model={acceptanceModel} filters={parseHistoryFilters({})} sourceError={null} onRefresh={() => undefined} />,
);
assert.match(acceptanceMarkup, /data-section="owner-review"/);
assert.match(acceptanceMarkup, /data-section="accepted"/);
assert.match(acceptanceMarkup, /Архив \/ Принятые/);
assert.match(acceptanceMarkup, /Проверил, принял/);
assert.match(acceptanceMarkup, /Не работает \/ На доработку/);
assert.match(acceptanceMarkup, /Приёмка пока недоступна/);
assert.match(acceptanceMarkup, /Вернуть в работу/);
const presentedAt = acceptanceMarkup.indexOf("Документ ждёт владельца");
const presentedToggle = acceptanceMarkup.slice(
  acceptanceMarkup.lastIndexOf("<button", presentedAt),
  acceptanceMarkup.indexOf("</button>", presentedAt),
);
assert.doesNotMatch(presentedToggle, /Проверил, принял/);
assert.match(acceptanceMarkup, /data-stage-badge="acceptance"[^>]*>На проверке/);
assert.match(acceptanceMarkup, /data-stage-badge="accepted"[^>]*>Принята/);

console.log("ai-company-dashboard-unit: ok");
