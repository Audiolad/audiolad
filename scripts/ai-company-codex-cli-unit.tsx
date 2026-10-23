/**
 * 9a63f86e rework: Codex card from the real Codex CLI probe (Core codex.cli_probe).
 * Connection only from a fresh probe; «выполняет задачу» only from a live tracked run;
 * a Core run that names Codex is an assignment; no green from an old fact.
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { buildAiCompanyDashboard, parseCompanyStatus, parseHistoryFilters } from "../src/lib/admin/ai-company-dashboard";

const NOW_ISO = "2026-10-13T08:30:00.000Z";
const NOW = Date.parse(NOW_ISO);
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString();
const filters = parseHistoryFilters({});

const assignedTask = {
  id: "0e05333f-2458-4c53-9e81-ece5f353693c",
  title: "Audiolad Business: технический SPA-пилот",
  status: "executive_dispatched",
  executor: { provider: null, run_id: "codex-server-0e05333f-pr1", orchestrator: "grok" },
  executive_run: { run_id: "codex-server-0e05333f-pr1", last_event: "pr_opened", last_event_at: minutesAgo(10) },
};
const grokBoxTask = {
  id: "9a63f86e-4fd2-461c-babf-511117052d56",
  title: "Табло: Codex",
  status: "executive_dispatched",
  executor: { provider: "grok", run_id: "grok-box-9a63f86e-rework-cli", orchestrator: "grok" },
  executive_run: { run_id: "grok-box-9a63f86e-rework-cli", last_event: "progress", last_event_at: minutesAgo(5) },
};

function probe(over: Record<string, unknown> = {}) {
  return {
    source: "codex_cli_probe",
    status: "verified",
    checked_at: minutesAgo(4),
    transport: "ssh",
    fresh: true,
    cli_available: true,
    cli_version: "codex-cli 0.160.1",
    chatgpt_authorized: true,
    login_mode: "chatgpt",
    reason: null,
    busy: false,
    busy_source: null,
    current_run: null,
    tracked_runs: [],
    untracked_exec_count: 0,
    ...over,
  };
}

function codexCard(cli: Record<string, unknown> | null, tasks: unknown[] = [assignedTask, grokBoxTask]) {
  const parsed = parseCompanyStatus({
    generated_at: NOW_ISO,
    tasks,
    agents: [],
    heartbeats: [],
    recent_events: [],
    executors: [{ provider: "codex", role: "executor", connection: "idle", freshness_at: minutesAgo(4), authenticated: true, gate: null }],
    codex: { connection: "idle", authenticated: false, cli_verified: cli?.status === "verified", gate: null, pilot_ok: false, cli_probe: cli },
  });
  assert.ok(parsed);
  const model = buildAiCompanyDashboard(parsed, filters);
  return { model, card: model.executors.find((item) => item.id === "codex")! };
}

// Verified, no codex exec process: «проверено · свободен» even though Core assigned a run to Codex.
const idle = codexCard(probe({ sessions: [], slots: { used: 0, max: 2 } })).card;
assert.equal(idle.connection, "verified");
assert.equal(idle.occupancy, "free");
assert.equal(idle.summary, "проверено · свободен");
assert.match(idle.connectionSource, /Авторизован в ChatGPT · CLI доступен \(codex-cli 0\.160\.1\) · Проверено в .* МСК/);
assert.match(idle.connectionSource, /по SSH/);
assert.match(idle.detail, /Назначено Codex в Company Core: 1\. Это назначение, а не подтверждённая занятость/);
assert.doesNotMatch(idle.detail, /без регистрации запуска/);
assert.deepEqual(idle.sessions, []);
assert.match(idle.detail, /Работа Грога на своём боксе не приписывается Codex/);
assert.equal(idle.currentTask, "Нет отслеживаемого запуска Codex");
assert.equal(idle.runId, "Нет данных");
assert.match(idle.activeRunsLabel, /не подтверждает занятость/);
assert.equal(idle.signalSource.includes("проба Codex CLI"), true);
// Grok-box work is not a Codex run.
assert.equal(idle.activeRuns.some((run) => run.runId.startsWith("grok-box")), false);

// Live tracked run → «выполняет задачу» with run id and task title.
const busy = codexCard(probe({
  busy: true,
  busy_source: "tracked_run",
  current_run: { run_id: "codex-review-841-a8", task_id: "0e05333f-2458-4c53-9e81-ece5f353693c", pid: 4130138, started_at: minutesAgo(20), heartbeat_at: minutesAgo(5) },
})).card;
assert.equal(busy.occupancy, "working");
assert.equal(busy.summary, "проверено · выполняет задачу");
assert.equal(busy.runId, "codex-review-841-a8");
assert.equal(busy.currentTask, "Audiolad Business: технический SPA-пилот");
assert.match(busy.detail, /отслеживаемый запуск codex-review-841-a8/);

// 23.10 bug: real codex exec processes started over SSH are occupancy («занят N из 2»),
// with task, mode, start and elapsed per session; no command line on the board.
const twoSessions = codexCard(probe({
  busy: true,
  busy_source: "process",
  current_run: { run_id: "codex-exec-3085834", task_id: "0e05333f", pid: 3085834, started_at: minutesAgo(30), heartbeat_at: minutesAgo(1) },
  untracked_exec_count: 2,
  slots: { used: 2, max: 2 },
  sessions: [
    { pid: 3085834, tracked: false, run_id: null, task_id: "0e05333f", task_source: "worktree", work_name: "0e05333f-fix", mode: "write", started_at: minutesAgo(30), elapsed_s: 1500 },
    { pid: 3082951, tracked: false, run_id: null, task_id: null, task_source: null, work_name: "archive-fix", mode: "read_only", started_at: minutesAgo(7), elapsed_s: 120 },
  ],
})).card;
assert.equal(twoSessions.occupancy, "working");
assert.equal(twoSessions.occupancyLabel, "занят 2 из 2");
assert.equal(twoSessions.summary, "проверено · занят 2 из 2");
assert.equal(twoSessions.activeRunsLabel, "Сессий Codex: 2 из 2");
assert.equal(twoSessions.sessions.length, 2);
assert.equal(twoSessions.sessions[0].task, "Задача 0e05333f («Audiolad Business: технический SPA-пилот»)");
assert.equal(twoSessions.sessions[0].mode, "пишет (workspace-write)");
assert.match(twoSessions.sessions[0].started, /МСК$/);
assert.equal(twoSessions.sessions[0].elapsed, "идёт 30 мин");
assert.equal(twoSessions.sessions[0].registration, "без регистрации запуска (pid 3085834)");
assert.equal(twoSessions.sessions[1].task, "Каталог archive-fix, задача не определена");
assert.equal(twoSessions.sessions[1].mode, "ревью read-only");
assert.equal(twoSessions.runId, "Нет данных");
assert.equal(twoSessions.currentTask, twoSessions.sessions[0].task);
assert.match(twoSessions.detail, /без регистрации запуска: 2\. Они считаются занятостью/);
assert.doesNotMatch(twoSessions.detail, /отслеживаемый запуск codex-exec/);
{
  const { model: busyModel } = codexCard(probe({
    busy: true,
    slots: { used: 1, max: 2 },
    sessions: [{ pid: 77, tracked: true, run_id: "codex-9a63f86e-20261023T0936Z-1", task_id: "9a63f86e", task_source: "env", work_name: "9a63f86e", mode: "read_only", started_at: minutesAgo(3), elapsed_s: 180 }],
    current_run: { run_id: "codex-9a63f86e-20261023T0936Z-1", task_id: "9a63f86e", pid: 77, started_at: minutesAgo(3), heartbeat_at: minutesAgo(1) },
  }));
  const card = busyModel.executors.find((item) => item.id === "codex")!;
  assert.equal(card.summary, "проверено · занят 1 из 2");
  assert.equal(card.runId, "codex-9a63f86e-20261023T0936Z-1");
  assert.equal(card.sessions[0].registration, "запуск codex-9a63f86e-20261023T0936Z-1");
  const html = renderToStaticMarkup(<AiCompanyDashboardView model={busyModel} filters={filters} sourceError={null} onRefresh={() => undefined} />);
  const at = html.indexOf('data-executor="codex"');
  const codexSection = html.slice(at, html.indexOf("</article>", at));
  assert.match(codexSection, /Codex · занят 1 из 2/);
  assert.match(codexSection, /data-executor-sessions="codex"/);
  assert.match(codexSection, /Задача 9a63f86e/);
  assert.match(codexSection, /ревью read-only · начата .* МСК · идёт 3 мин/);
  assert.doesNotMatch(codexSection, /—/);
}

// Older Core without sessions: a count of unregistered processes is still occupancy.
const legacy = codexCard(probe({ untracked_exec_count: 1 })).card;
assert.equal(legacy.occupancy, "working");
assert.equal(legacy.occupancyLabel, "занят 1");
assert.equal(legacy.sessions[0].task, "Задача не определена");

// Malformed session fields are dropped, never rendered raw.
const odd = codexCard(probe({ sessions: [{ pid: 5, task_id: "x; rm -rf", work_name: "a b", mode: "evil", started_at: null }], slots: { max: 2 } })).card;
assert.equal(odd.sessions[0].task, "Задача не определена");
assert.equal(odd.sessions[0].mode, "режим не определён");

// busy flag without a run id is not occupancy.
assert.equal(codexCard(probe({ busy: true, current_run: null })).card.occupancy, "free");

// Failed probe → «недоступно» with reason, not green.
const failed = codexCard(probe({ status: "failed", chatgpt_authorized: false, login_mode: "none", reason: "Недоступен: `codex login status` — не авторизован." })).card;
assert.equal(failed.connection, "unavailable");
assert.equal(failed.occupancy, "unknown");
assert.match(failed.connectionSource, /не авторизован/);

// Stale (Core says stale, or the board sees it older than 20 min) → «Нет свежей проверки».
for (const cli of [probe({ status: "stale", checked_at: minutesAgo(40) }), probe({ checked_at: minutesAgo(25) })]) {
  const stale = codexCard(cli).card;
  assert.equal(stale.connection, "stale");
  assert.equal(stale.occupancy, "unknown");
  assert.match(stale.connectionSource, /Нет свежей проверки/);
  assert.doesNotMatch(stale.summary, /проверено/);
}

// Absent probe → previous behaviour (no claim from the probe).
const absent = codexCard(probe({ status: "absent", checked_at: null })).card;
assert.notEqual(absent.connectionSource.includes("Проба Codex CLI"), true);

// Markup: the board renders the probe facts and never «не подключён».
const { model } = codexCard(probe());
const markup = renderToStaticMarkup(<AiCompanyDashboardView model={model} filters={filters} sourceError={null} onRefresh={() => undefined} />);
const start = markup.indexOf('data-executor="codex"');
assert.ok(start > 0);
const section = markup.slice(start, markup.indexOf("</article>", start));
assert.match(section, /Авторизован в ChatGPT/);
assert.match(section, /проверено/);
assert.match(section, /data-occupancy="free"/);
assert.doesNotMatch(section, /не подключён|не удалось проверить/);

console.log("ai-company-codex-cli-unit: ok");
