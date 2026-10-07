import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
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
assert.doesNotMatch(page, /updated_at/);
assert.doesNotMatch(page, /httpEquiv|http-equiv/);
assert.match(dashboardSource, /router\.refresh/);
assert.match(dashboardSource, /clearInterval/);
assert.match(dashboardSource, /data-section="now"/);
assert.equal(companyStatusRequestPath(parseHistoryFilters({})), "/v1/status");
assert.equal(
  companyStatusRequestPath(parseHistoryFilters({ history_cursor: "page-2" })),
  "/v1/status?history_cursor=page-2",
);

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
assert.equal(CORE_FIELD_MAP.task.verifiedProgress[0], "verified_progress");
assert.equal(CORE_FIELD_MAP.executiveRun.headSha[0], "head_sha");
assert.equal(CORE_FIELD_MAP.root.currentGates[0], "current_gates");
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
  events: [
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
  recent_events: [],
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
const measured = liveModel.activeTasks.find((task) => task.title === "Задача с единицами");
assert.ok(measured);
assert.match(measured.progress, /4 из 7/);
assert.match(measured.progress, /закрытые критерии приёмки/);
assert.match(measured.progress, /06\.10\.2026/);
assert.doesNotMatch(measured.progress, /100%/);
const codexGate = liveModel.decisions.find((gate) => gate.reason.includes("Codex readiness"));
assert.ok(codexGate);
assert.equal(codexGate.decisionOwner, "Oriy");
assert.match(codexGate.nextAction, /не подключён/);
assert.match(codexGate.nextAction, /Переназначение от Сергея не требуется/);
assert.doesNotMatch(`${codexGate.request} ${codexGate.nextAction}`, /Переназначьте/);
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
    codex: { source: "openai_usage", included_used: 12, included_limit: 50, resets_at: "2026-10-08T00:00:00.000Z" },
    cursor: { source: "cursor_pool", spend_usd: 0, pool_usd: 20 },
    grok: { source: "unconfirmed", spend_usd: 3 },
  },
  costs: { amount_usd: 0, source: "unknown" },
})!;
const pricedModel = buildAiCompanyDashboard(priced, parseHistoryFilters({}));
assert.match(pricedModel.quotas.find((line) => line.id === "codex")!.value, /12 из 50/);
assert.match(pricedModel.quotas.find((line) => line.id === "codex")!.value, /не остаток лимита/);
assert.match(pricedModel.quotas.find((line) => line.id === "cursor")!.value, /\$0/);
assert.match(pricedModel.quotas.find((line) => line.id === "cursor")!.value, /не является остатком лимита/);
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
assert.match(liveMarkup, /Архив блокировок/);
assert.doesNotMatch(liveMarkup.slice(0, liveMarkup.indexOf("Архив блокировок")), /Старый блокер уже снят/);
assert.match(liveMarkup, /grid-cols-2/);
assert.match(liveMarkup, /lg:grid-cols-3/);
assert.match(liveMarkup, /period=week/);
assert.doesNotMatch(liveMarkup, /api_key|must-not-leak|Bearer /);

console.log("ai-company-dashboard-unit: ok");
