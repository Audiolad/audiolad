/**
 * 9a63f86e: «Исполнители» — connection, occupancy, active runs and freshness are separate facts.
 * Missing data is never «не подключён»; a Core provider record is not proof of availability.
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import {
  buildAiCompanyDashboard,
  deriveConnection,
  parseCompanyStatus,
  parseHistoryFilters,
} from "../src/lib/admin/ai-company-dashboard";

const NOW_ISO = "2026-10-13T06:20:00.000Z";
const NOW = Date.parse(NOW_ISO);
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

// --- deriveConnection: every state.
assert.equal(deriveConnection({ explicit: "online", checkedAt: minutesAgo(5), now: NOW }), "verified");
assert.equal(deriveConnection({ explicit: null, checkedAt: minutesAgo(5), now: NOW }), "verified");
assert.equal(deriveConnection({ explicit: "online", checkedAt: minutesAgo(120), now: NOW }), "stale");
assert.equal(deriveConnection({ explicit: "not_connected", checkedAt: minutesAgo(5), now: NOW }), "unavailable");
assert.equal(deriveConnection({ explicit: "not_connected", checkedAt: null, now: NOW }), "no_data");
assert.equal(deriveConnection({ explicit: "not_connected", checkedAt: null, now: NOW, checkPathMismatch: true }), "check_failed");
assert.equal(deriveConnection({ explicit: null, checkedAt: null, now: NOW }), "no_data");
assert.equal(deriveConnection({ explicit: "unknown", checkedAt: null, now: NOW }), "no_data");

// --- Production shape of 13.10.2026: Codex token-only check, one Codex run with fresh pr_opened, one old Codex run, one finished.
function snapshot(overrides: Record<string, unknown> = {}) {
  const parsed = parseCompanyStatus({
    generated_at: NOW_ISO,
    tasks: [
      {
        id: "0e05333f-2458-4c53-9e81-ece5f353693c",
        title: "Audiolad Business: технический SPA-пилот",
        status: "executive_dispatched",
        executor: { provider: null, run_id: "codex-server-0e05333f-pr1", orchestrator: "grok" },
        executive_run: {
          run_id: "codex-server-0e05333f-pr1",
          last_event: "pr_opened",
          last_event_at: minutesAgo(20),
          pr_url: "https://github.com/Audiolad/audiolad/pull/841",
        },
      },
      {
        id: "11111111-old0-0000-0000-000000000000",
        title: "Старый запуск Codex",
        status: "executive_dispatched",
        executor: { run_id: "codex-server-old" },
        executive_run: { run_id: "codex-server-old", last_event: "started", last_event_at: minutesAgo(600) },
      },
      {
        id: "22222222-done-0000-0000-000000000000",
        title: "Завершённая задача Codex",
        status: "done",
        executor: { run_id: "codex-server-done" },
        executive_run: { run_id: "codex-server-done", last_event: "progress", last_event_at: minutesAgo(10) },
      },
    ],
    agents: [],
    heartbeats: [],
    recent_events: [],
    executors: [
      { provider: "codex", role: "executor", connection: "not_connected", connection_label: "не подключён", freshness_at: null, gate: "CODEX_ACCESS_TOKEN", authenticated: false },
      { provider: "cursor", role: "executor", connection: "stale", freshness_at: "2026-10-08T05:47:31.218Z" },
      { provider: "grok", role: "orchestrator", connection: "online", freshness_at: minutesAgo(3) },
    ],
    codex: { connection: "not_connected", connection_label: "не подключён", authenticated: false, gate: "CODEX_ACCESS_TOKEN", pilot_ok: false },
    ...overrides,
  });
  assert.ok(parsed);
  return parsed;
}

const filters = parseHistoryFilters({});
const model = buildAiCompanyDashboard(snapshot(), filters);
const codex = model.executors.find((item) => item.id === "codex")!;
assert.equal(codex.connection, "check_failed");
assert.equal(codex.connectionLabel, "не удалось проверить");
assert.match(codex.connectionSource, /по SSH/);
assert.equal(codex.occupancy, "working");
assert.equal(codex.summary, "не удалось проверить · выполняет задачу");
// Active runs listed separately, newest progress first; finished task is not active.
assert.deepEqual(codex.activeRuns.map((run) => run.runId), ["codex-server-0e05333f-pr1", "codex-server-old"]);
assert.equal(codex.activeRuns[0].fresh, true);
assert.equal(codex.activeRuns[0].stage, "pr_opened");
assert.equal(codex.activeRuns[0].prHref, "https://github.com/Audiolad/audiolad/pull/841");
assert.match(codex.activeRuns[0].lastProgress, /МСК/);
assert.equal(codex.activeRuns[1].fresh, false);
assert.equal(codex.activeRuns.some((run) => run.runId === "codex-server-done"), false);
assert.match(codex.signalSource, /событие запуска/);
assert.match(codex.freshness, /свежие/);
assert.match(codex.detail, /Без подтверждённого прогресса дольше 60 минут: 1/);
assert.match(codex.detail, /по идентификатору запуска/);
assert.doesNotMatch(`${codex.summary} ${codex.roleNote} ${codex.detail}`, /не подключ|заблокирован/);

const cursor = model.executors.find((item) => item.id === "cursor")!;
assert.equal(cursor.connection, "stale");
assert.equal(cursor.occupancy, "unknown");
assert.equal(cursor.activeRunsLabel, "Нет активных запусков");
const grok = model.executors.find((item) => item.id === "grok")!;
assert.equal(grok.connection, "verified");
assert.equal(grok.kind, "orchestrator");

// --- Only stale runs: occupancy unknown, not «выполняет задачу».
const staleOnly = buildAiCompanyDashboard(
  snapshot({ tasks: [{ id: "x", title: "Старый", status: "executive_dispatched", executor: { run_id: "codex-a" }, executive_run: { run_id: "codex-a", last_event_at: minutesAgo(300) } }] }),
  filters,
).executors.find((item) => item.id === "codex")!;
assert.equal(staleOnly.occupancy, "unknown");
assert.match(staleOnly.freshness, /устарели/);

// --- Verified + no runs → свободен. Unavailable needs a real check timestamp.
const free = buildAiCompanyDashboard(
  snapshot({ tasks: [], codex: null, executors: [{ provider: "codex", connection: "online", freshness_at: minutesAgo(2) }] }),
  filters,
).executors.find((item) => item.id === "codex")!;
assert.equal(free.connection, "verified");
assert.equal(free.occupancy, "free");
assert.equal(free.activeRunsLabel, "Нет активных запусков");
const down = buildAiCompanyDashboard(
  snapshot({ tasks: [], codex: null, executors: [{ provider: "codex", connection: "not_connected", freshness_at: minutesAgo(2) }] }),
  filters,
).executors.find((item) => item.id === "codex")!;
assert.equal(down.connection, "unavailable");
assert.equal(down.connectionLabel, "недоступно");
const nothing = buildAiCompanyDashboard(snapshot({ tasks: [], codex: null, executors: [] }), filters).executors.find((item) => item.id === "codex")!;
assert.equal(nothing.connection, "no_data");
assert.equal(nothing.occupancy, "unknown");
assert.equal(nothing.heartbeat, "Нет данных");

// --- Markup: no «не подключён» in the section, runs and links visible.
const markup = renderToStaticMarkup(
  <AiCompanyDashboardView model={model} filters={filters} sourceError={null} onRefresh={() => undefined} />,
);
const start = markup.indexOf('data-section="executors"');
const section = markup.slice(start, markup.indexOf('data-section="today"', start));
assert.doesNotMatch(section, /не подключён|Готовность Codex заблокирована/);
assert.match(section, /Codex · выполняет задачу/);
assert.match(section, /не удалось проверить/);
assert.match(section, /codex-server-0e05333f-pr1/);
assert.match(section, /pull\/841/);
assert.match(section, /давно, не считается текущей работой/);
assert.match(section, /Нет активных запусков/);
assert.match(section, /data-occupancy="working"/);

console.log("ai-company-executors-unit: ok");
