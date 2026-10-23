/**
 * board-live-signal: Grok and Cursor occupancy comes from Core executors[].live
 * (fresh task callbacks and Codex sessions of box tasks), not «занятость неизвестна» by default.
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { buildAiCompanyDashboard, parseCompanyStatus, parseHistoryFilters } from "../src/lib/admin/ai-company-dashboard";

const NOW_ISO = "2026-10-23T13:50:00.000Z";
const NOW = Date.parse(NOW_ISO);
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString();
const GROK_TASK = "d5075209-1111-4222-8333-444455556666";
const GROK_TASK_2 = "f17700ec-1111-4222-8333-444455556666";
const CURSOR_TASK = "f8f5908b-1111-4222-8333-444455556666";

function build(executors: unknown[]) {
  const parsed = parseCompanyStatus({
    generated_at: NOW_ISO,
    tasks: [
      { id: GROK_TASK, title: "Живой статус исполнителей", status: "in_progress", github_issue_number: 950, executor: { run_id: "grok-box-d5075209" } },
      { id: GROK_TASK_2, title: "Вторая задача бокса", status: "in_progress", executor: { run_id: "codex-amsterdam-f17700ec" } },
      { id: CURSOR_TASK, title: "Задача Cursor", status: "in_progress", executor: { run_id: "bc-f11c551e" } },
    ],
    agents: [],
    heartbeats: [],
    recent_events: [],
    executors,
    codex: null,
  });
  assert.ok(parsed);
  return buildAiCompanyDashboard(parsed, parseHistoryFilters({}));
}

const busyGrok = {
  provider: "grok",
  role: "orchestrator",
  connection: "online",
  freshness_at: minutesAgo(4),
  live: {
    status: "busy",
    sessions: [
      { task_id: GROK_TASK, title: "Живой статус исполнителей", github_issue: 950, run_id: "grok-box-d5075209", last_signal_at: minutesAgo(4), source: "callback" },
      { task_id: GROK_TASK_2, title: "Вторая задача бокса", github_issue: null, run_id: "codex-amsterdam-f17700ec", last_signal_at: minutesAgo(1), source: "codex_session" },
    ],
    stale_runs: [{ task_id: "ac5e0882-0000-0000-0000-000000000000", run_id: "grok-box-ac5e0882", last_signal_at: minutesAgo(50) }],
    abandoned_runs: 3,
    reason: "Свежий сигнал по 2 задачам на воркерах бокса Grok.",
  },
};
const freeCursor = {
  provider: "cursor",
  role: "executor",
  connection: "stale",
  freshness_at: minutesAgo(200),
  live: { status: "free", sessions: [], stale_runs: [], abandoned_runs: 1, reason: "Нет открытых задач на запусках Cursor (bc-…) с сигналом за последние 2 часа." },
};

const model = build([busyGrok, freeCursor]);
const grok = model.executors.find((item) => item.id === "grok")!;
assert.equal(grok.occupancy, "working");
assert.equal(grok.occupancyLabel, "занят 2");
assert.deepEqual(grok.sessions.map((item) => item.taskId), [GROK_TASK, GROK_TASK_2]);
assert.match(grok.sessions[0].task, /^Задача d5075209 \(«Живой статус исполнителей»\)$/);
assert.equal(grok.sessions[0].taskHref, "https://github.com/Audiolad/audiolad/issues/950");
assert.match(grok.sessions[0].signal ?? "", /^сигнал .+ МСК, 4 мин назад$/);
assert.match(grok.sessions[1].mode, /сессия Codex/);
assert.equal(grok.activeRunsLabel, "Задач в работе по свежим сигналам: 2");
assert.match(grok.detail, /Без сигнала от 20 минут до 2 часов: ac5e0882/);
assert.match(grok.detail, /дольше 2 часов .*: 3/);

const cursor = model.executors.find((item) => item.id === "cursor")!;
assert.equal(cursor.occupancy, "free");
assert.equal(cursor.sessions.length, 0);
assert.match(cursor.detail, /Нет открытых задач на запусках Cursor/);

const html = renderToStaticMarkup(<AiCompanyDashboardView model={model} filters={parseHistoryFilters({})} sourceError={null} onRefresh={() => undefined} />);
assert.match(html, /Grok · занят 2/);
assert.match(html, /Задача d5075209/);
assert.match(html, /колбэк задачи в Company Core · сигнал/);
assert.doesNotMatch(html, /Grok · занятость неизвестна/);
for (const text of [grok.detail, grok.activeRunsLabel, ...grok.sessions.flatMap((item) => [item.task, item.mode, item.signal ?? ""]), cursor.detail]) {
  assert.doesNotMatch(text, /\u2014/);
}

// unknown stays unknown; no live block keeps the old logic.
const unknownModel = build([{ ...busyGrok, live: { status: "unknown", sessions: [], stale_runs: busyGrok.live.stale_runs, abandoned_runs: 0, reason: "Нет свежего сигнала." } }]);
const unknownGrok = unknownModel.executors.find((item) => item.id === "grok")!;
assert.equal(unknownGrok.occupancy, "unknown");
assert.equal(unknownGrok.sessions.length, 0);
const legacy = build([{ provider: "grok", role: "orchestrator", connection: "online", freshness_at: minutesAgo(3) }]);
assert.equal(legacy.executors.find((item) => item.id === "grok")!.occupancy === "working", false);
// A live block on the wrong provider never leaks into another row.
const leak = build([{ ...freeCursor, provider: "codex" }]);
assert.notEqual(leak.executors.find((item) => item.id === "cursor")!.occupancy, "free");

// Garbage or partial live data never yields «занят»: an empty session is not proof of work.
const legacyBase = { provider: "grok", role: "orchestrator", connection: "online", freshness_at: minutesAgo(3) };
for (const sessions of [[{}], [{ task_id: GROK_TASK }], [{ last_signal_at: minutesAgo(1) }], [{ task_id: "x@y.z", last_signal_at: minutesAgo(1) }], "nope"]) {
  const row = build([{ ...legacyBase, live: { status: "busy", sessions, stale_runs: [], abandoned_runs: 0, reason: "r" } }])
    .executors.find((item) => item.id === "grok")!;
  assert.equal(row.occupancy, "unknown");
  assert.equal(row.sessions.length, 0);
  assert.doesNotMatch(row.occupancyLabel, /занят \d/);
}
// Reason and run id are masked / validated; an unknown source gets the neutral label.
const odd = build([{ ...legacyBase, live: { status: "busy", sessions: [{ task_id: GROK_TASK, last_signal_at: minutesAgo(2), run_id: "x@y.z run", source: "__proto__" }], stale_runs: [], abandoned_runs: -5, reason: "пишет owner@example.com" } }])
  .executors.find((item) => item.id === "grok")!;
assert.equal(odd.occupancyLabel, "занят 1");
assert.equal(odd.sessions[0].mode, "сигнал Company Core");
assert.equal(odd.sessions[0].registration, "запуск не указан");
assert.doesNotMatch(odd.detail, /@/);
assert.doesNotMatch(odd.detail, /дольше 2 часов/);
// An invalid live block leaves the row exactly as an older Core without live.
const legacyRow = build([legacyBase]).executors.find((item) => item.id === "grok")!;
for (const live of [null, "busy", { status: "weird" }, []]) {
  assert.deepEqual(build([{ ...legacyBase, live }]).executors.find((item) => item.id === "grok")!, legacyRow);
}

console.log("ai-company-live-occupancy-unit: ok");
