import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import AiCompanyDashboard from "../src/components/admin/AiCompanyDashboard";
import {
  ADMIN_NAV_ITEMS,
  getVisibleAdminNavItems,
} from "../src/lib/admin/nav";
import {
  buildAiCompanyDashboard,
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
assert.equal(isCompletedStatus("merged"), true);

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
  model.attention.some((item) => item.includes("Продуктовый")),
  false,
);
assert.equal(
  model.attention.some((item) => item.includes("Ручное разрешение")),
  true,
);

const qaCard = model.agents.find((agent) => agent.slug === "qa")!;
assert.equal(qaCard.tone, "waiting");
assert.match(qaCard.stateLabel, /Ожидает/);
assert.equal(qaCard.currentTaskTitle, "Табло после QA");
assert.match(qaCard.qaState, /RETURN/);
assert.doesNotMatch(qaCard.qaState, /must-not-leak/);

const productCard = model.agents.find((agent) => agent.slug === "product")!;
assert.equal(productCard.tone, "idle");
assert.match(productCard.stateLabel, /Не подключён \/ простаивает/);

const researchCard = model.agents.find((agent) => agent.slug === "research")!;
assert.equal(researchCard.tone, "attention");
assert.match(researchCard.freshness, /старше 60 минут/);
assert.match(researchCard.startedAt, /29\.09\.2026/);

const uxCard = model.agents.find((agent) => agent.slug === "ux")!;
assert.equal(uxCard.tone, "idle");
assert.equal(uxCard.currentTaskTitle, "Нет данных");

assert.deepEqual(
  model.todayRows.map((row) => row.title),
  ["Получена сегодня", "Другая активная задача"],
);
assert.equal(
  model.todayRows.some((row) => row.title === "Только обновлена сегодня"),
  false,
);
assert.equal(
  model.todayRows.some((row) => row.title === "Ждёт проверку"),
  false,
);

const qaDetail = model.todayRows.find((row) => row.title === "Другая активная задача");
assert.ok(qaDetail);
assert.match(qaDetail.timeLabel, /создание записи/);

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
assert.equal(ambiguousCard.tone, "idle");

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
assert.equal(noReceiptModel.todayRows.length, 0);
assert.match(noReceiptModel.todayNote, /Нет данных о времени получения/);

const qaHistory = model.agents.find((agent) => agent.slug === "qa")!;
assert.match(qaHistory.qaState, /pull\/656/);
assert.match(qaHistory.qaState, /skipped/);

const markup = renderToStaticMarkup(
  <AiCompanyDashboard model={model} filters={parseHistoryFilters({})} />,
);
assert.match(markup, /Сегодня в компании/);
assert.match(markup, /История работы/);
assert.match(markup, /ИИ-компания/);
assert.match(markup, /data-state="working"/);
assert.match(markup, /data-state="idle"/);
assert.match(markup, /data-state="attention"/);
assert.match(markup, /grid-cols-2/);
assert.match(markup, /lg:grid-cols-2/);
assert.match(markup, /sm:flex-row/);
const historyMarkup = markup.slice(markup.indexOf('data-section="history"'));
assert.doesNotMatch(historyMarkup, /Табло после QA/);
assert.match(historyMarkup, /Старая готовая задача/);
assert.doesNotMatch(markup, /must-not-leak/);

assert.equal(parseCompanyStatus({ tasks: [], agents: [] }), null);

const page = readFileSync("src/app/(platform)/admin/ai-company/page.tsx", "utf8");
assert.match(page, /requireAdminPermission\("ai_company\.view"\)/);
assert.match(page, /parseCompanyStatus/);
assert.doesNotMatch(page, /updated_at/);

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

console.log("ai-company-dashboard-unit: ok");
