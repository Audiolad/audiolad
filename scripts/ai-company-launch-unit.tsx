/**
 * Board tabs and «В работу» for /admin/ai-company against a real Company Core payload
 * (scripts/fixtures/ai-company/core29-launch.json, company-core PR #29, docs/launch-api.md).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { parseBoardTabParam } from "../src/lib/admin/ai-company-dashboard";
import {
  buildAiCompanyDashboard,
  composeAiCompanyBoard,
  parseCompanyStatus,
  parseHistoryFilters,
  type DashboardModel,
  type TaskDetailModel,
} from "../src/lib/admin/ai-company-dashboard";
import {
  LAUNCH_OWNER_ONLY,
  handleOwnerLaunchRequest,
  interpretLaunchResponse,
  launchCommandPath,
  validateLaunchCommand,
  waitingText,
} from "../src/lib/admin/ai-company-launch";

const raw = JSON.parse(readFileSync("scripts/fixtures/ai-company/core29-launch.json", "utf8")) as {
  tasks: Array<Record<string, unknown> & { id: string; title: string }>;
};
const idOf = (title: string): string => {
  const found = raw.tasks.find((task) => task.title === title);
  assert.ok(found, title);
  return found.id;
};
const PLANNED = idOf("Обновить справку для авторов");
const WAITING = idOf("Переписать модуль отчётов");
const FAILED = idOf("Добавить заметку к заказу");
const SENT = idOf("Добавить экспорт отчёта");
const ACKED = idOf("Исправить подпись в календаре");
const STARTED = idOf("Добавить фильтр в каталог");
const BARE_PR = idOf("Починить сортировку");
const REVIEW = idOf("Исправить время прослушивания");

const status = parseCompanyStatus(raw)!;
assert.ok(status);
const filters = parseHistoryFilters({});
const composed = composeAiCompanyBoard({ data: status, error: null }, { data: null, error: "нет" }, filters);
const model = composed.model as DashboardModel;
assert.ok(model);

function detailOf(rows: TaskDetailModel[], id: string): TaskDetailModel | undefined {
  return rows.find((row) => row.taskId === id);
}

// --- Server-decided tabs land in the right lists.
assert.deepEqual(model.plan.map((row) => row.taskId).sort(), [PLANNED, WAITING].sort());
assert.ok(!model.queue.some((row) => [PLANNED, WAITING].includes(row.taskId)), "plan tasks are not queued work");
assert.ok(!model.activeTasks.some((card) => [PLANNED, WAITING].includes(card.detail.taskId)), "plan tasks are not active work");
assert.deepEqual(model.ownerReview.map((row) => row.taskId), [REVIEW], "only the task with real evidence reaches «Приёмка»");
const working = [...model.activeTasks.map((card) => card.detail), ...model.queue].map((row) => row.taskId);
assert.ok(working.includes(BARE_PR), "a bare pull request (presented, no verification) stays in work");
assert.ok(!model.ownerReview.some((row) => row.taskId === BARE_PR));
for (const id of [SENT, ACKED, STARTED, FAILED]) assert.ok(working.includes(id), `${id} is in work`);

// --- Real states, never invented progress.
const planned = detailOf(model.plan, PLANNED)!;
assert.equal(planned.stageBadge.label, "В плане");
assert.equal(planned.launch?.canPress, true);
assert.equal(planned.launch?.buttonLabel, "В работу");
const waiting = detailOf(model.plan, WAITING)!;
assert.equal(waiting.stageBadge.label, "Ожидает мощности");
assert.match(waiting.stageBadge.detail ?? "", /тяжёл/i);
const all = [...model.activeTasks.map((card) => card.detail), ...model.queue];
const sent = detailOf(all, SENT)!;
assert.equal(sent.stageBadge.label, "Ожидает подтверждения");
assert.equal(sent.launch?.canPress, false, "a delivered task has no «В работу» button");
const acked = detailOf(all, ACKED)!;
assert.equal(acked.stageBadge.label, "Принята Грогом, не начата");
const failed = detailOf(all, FAILED)!;
assert.equal(failed.stageBadge.label, "Не отправлена");
assert.match(failed.stageBadge.detail ?? "", /Нет связи с мостом Грога/);
assert.equal(failed.launch?.canPress, true, "a failed delivery offers the safe retry");
assert.equal(failed.launch?.buttonLabel, "Повторить отправку");
const started = detailOf(all, STARTED)!;
assert.notEqual(started.stageBadge.label, "Ожидает подтверждения");
assert.equal(started.launch?.state, "started");
const startedFacts = Object.fromEntries(started.launch!.facts.map((fact) => [fact.label, fact.value]));
assert.notEqual(startedFacts["Подтверждение Грога (ACK)"], "Нет данных");
assert.notEqual(startedFacts["Начало исполнения"], "Нет данных");
const sentFacts = Object.fromEntries(sent.launch!.facts.map((fact) => [fact.label, fact.value]));
assert.notEqual(sentFacts["Передана в мост Грога"], "Нет данных");
assert.equal(sentFacts["Подтверждение Грога (ACK)"], "Нет данных");
assert.equal(sentFacts["Начало исполнения"], "Нет данных");

// --- Markup: four tabs, panels, compact rows, owner-only button.
function render(canAccept: boolean, initialTab?: "plan" | "working" | "review" | "archive"): string {
  return renderToStaticMarkup(
    <AiCompanyDashboardView
      model={model}
      filters={filters}
      sourceError={null}
      acceptanceAvailable
      canAccept={canAccept}
      initialTab={initialTab}
      onRefresh={() => undefined}
    />,
  );
}
const owner = render(true);
const tabs = owner.slice(owner.indexOf("data-board-tabs"), owner.indexOf("data-tab-panel"));
const labels = [...tabs.matchAll(/data-board-tab="(\w+)"/g)].map((match) => match[1]);
assert.deepEqual(labels, ["plan", "working", "review", "archive"]);
for (const label of ["План", "В работе", "Приёмка", "Архив"]) assert.match(tabs, new RegExp(`>${label}<`));
assert.match(tabs, /role="tab"/);
assert.match(owner, /sticky top-0/);
const panelTag = (name: string) => owner.match(new RegExp(`<div[^>]*data-tab-panel="${name}"[^>]*>`))![0];
assert.doesNotMatch(panelTag("working"), /hidden=""/, "default tab is «В работе»");
for (const name of ["plan", "review", "archive"]) assert.match(panelTag(name), /hidden=""/);
const planMarkup = render(true, "plan");
assert.doesNotMatch(planMarkup.match(/<div[^>]*data-tab-panel="plan"[^>]*>/)![0], /hidden=""/);
assert.match(planMarkup.match(/<div[^>]*data-tab-panel="working"[^>]*>/)![0], /hidden=""/);
assert.equal(parseBoardTabParam("review"), "review");
assert.equal(parseBoardTabParam("nonsense"), "working");
assert.equal(parseBoardTabParam(undefined), "working");

function rowOf(markup: string, id: string): string {
  const start = markup.indexOf(`data-compact-row="`, markup.indexOf(id) - 400);
  const at = markup.indexOf(id);
  assert.ok(at >= 0, id);
  const article = markup.lastIndexOf("<article", at);
  return markup.slice(article, markup.indexOf("</article>", at));
}
const plannedRow = rowOf(owner, `data-plan-task="${PLANNED}"`);
assert.match(plannedRow, /aria-expanded="false"/, "compact row: collapsed");
assert.match(plannedRow, /Обновить справку для авторов/);
assert.match(plannedRow, /data-stage-badge="queue"[^>]*>В плане/);
const plannedButton = plannedRow.match(/<button[^>]*data-launch-button[^>]*>В работу<\/button>/);
assert.ok(plannedButton, "«В работу» button on a planned row");
assert.doesNotMatch(plannedButton[0], /disabled=""/);
assert.doesNotMatch(plannedRow, />[^<]*\d+\s?%[^<]*</, "no invented percentages");

// Non-owner session sees the state but not a live button.
const admin = render(false);
const adminPlanned = rowOf(admin, `data-plan-task="${PLANNED}"`);
assert.match(adminPlanned.match(/<button[^>]*data-launch-button[^>]*>В работу<\/button>/)![0], /disabled=""/);
assert.match(adminPlanned, new RegExp(LAUNCH_OWNER_ONLY.slice(0, 30)));

// A delivered task has no launch button; a failed one has the retry.
const sentArticle = owner.slice(owner.lastIndexOf("<article", owner.indexOf("Добавить экспорт отчёта")), owner.indexOf("</article>", owner.indexOf("Добавить экспорт отчёта")));
assert.doesNotMatch(sentArticle, /data-launch-button/);
assert.match(owner, />Повторить отправку<\/button>/);
assert.match(owner, />Принять<\/button>/);
assert.match(owner, />На доработку<\/button>/);
assert.match(owner, /Запуск: Ожидает подтверждения/);

// An older Core (no board_tab / launch) keeps the old behavior and shows an empty plan, not a fake one.
const old = parseCompanyStatus({
  generated_at: "2026-10-10T18:00:00.000Z",
  tasks: [{ id: "99999999-9999-4999-8999-999999999999", title: "Старая задача", status: "executive_in_progress", active: true }],
})!;
const oldModel = buildAiCompanyDashboard(old, filters);
assert.equal(oldModel.plan.length, 0);
assert.equal(oldModel.activeTasks.length, 1);
assert.match(renderToStaticMarkup(
  <AiCompanyDashboardView model={oldModel} filters={filters} sourceError={null} onRefresh={() => undefined} initialTab="plan" />,
), /Нет данных: задач в плане в полученном срезе нет/);

// --- Proxy: one validated command, Core path and headers, no actor from the browser.
const TASK = "11111111-1111-4111-8111-111111111111";
assert.equal(launchCommandPath(TASK), `/v1/tasks/${TASK}/launch`);
assert.throws(() => launchCommandPath("../x"));
assert.equal(validateLaunchCommand({ taskId: TASK, idempotencyKey: "abcdefgh-1" }).ok, true);
for (const bad of [null, [], { taskId: "x", idempotencyKey: "abcdefgh-1" }, { taskId: TASK, idempotencyKey: "short" }]) {
  assert.equal(validateLaunchCommand(bad).ok, false);
}
assert.equal((validateLaunchCommand({ taskId: TASK, idempotencyKey: "abcdefgh-1", actor: "sergey" }) as { code: string }).code, "actor_in_body");

async function proxyChecks() {
const calls: Array<{ url: string; init: RequestInit }> = [];
function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}
const base = "https://core.example/";
const owned = { userId: "u1", isOwner: true };
const sentOk = await handleOwnerLaunchRequest({
  body: { taskId: TASK, idempotencyKey: "abcdefgh-1" },
  base,
  token: "t-secret",
  actor: owned,
  fetchImpl: fakeFetch(200, { task_id: TASK, state: "sent", admitted: true, idempotent: false, delivery: { delivered: true } }),
});
assert.equal(sentOk.status, 200);
assert.equal(sentOk.body.ok, true);
assert.match(String(sentOk.body.message), /не «выполнено»/);
assert.equal(calls[0].url, `https://core.example/v1/tasks/${TASK}/launch`);
const headers = calls[0].init.headers as Record<string, string>;
assert.equal(headers["X-Company-Actor"], "sergey");
assert.equal(headers.Authorization, "Bearer t-secret");
assert.deepEqual(JSON.parse(String(calls[0].init.body)), { idempotency_key: "abcdefgh-1" });
assert.equal(JSON.stringify(sentOk.body).includes("t-secret"), false, "token never returned");

const denied = await handleOwnerLaunchRequest({
  body: { taskId: TASK, idempotencyKey: "abcdefgh-1" }, base, token: "t", actor: { userId: "u2", isOwner: false }, fetchImpl: fakeFetch(200, {}),
});
assert.equal(denied.status, 403);
assert.equal(denied.body.code, "owner_required");
assert.equal(calls.length, 1, "no Core call for a non-owner");

const waitingResult = interpretLaunchResponse(200, { task_id: TASK, state: "waiting", admitted: false, waiting_reason: "wip_active_full" }, TASK);
assert.equal(waitingResult.ok && waitingResult.waitingReason, "wip_active_full");
assert.match(waitingResult.ok ? waitingResult.message : "", /Ожидает/);
// Core 21546de4: the board never invents «нет свободной мощности» for a reason it does not know.
const NO_POWER = /нет свободной мощности/;
const repoConflict = interpretLaunchResponse(200, { task_id: TASK, state: "waiting", admitted: false, waiting_reason: "repo_conflict", waiting_label: "Ожидает: в этой ветке уже идёт работа" }, TASK);
assert.equal(repoConflict.ok && repoConflict.message, "Ожидает: в этой ветке уже идёт работа. Запуск начнётся сам, по порядку.");
const unknownRepo = interpretLaunchResponse(200, { task_id: TASK, state: "waiting", admitted: false, waiting_reason: "unknown_repo_capacity" }, TASK);
assert.match(unknownRepo.ok ? unknownRepo.message : "", /не указан репозиторий/);
assert.doesNotMatch(unknownRepo.ok ? unknownRepo.message : "", NO_POWER);
const coreLabelWins = interpretLaunchResponse(200, { task_id: TASK, state: "waiting", admitted: false, waiting_reason: "some_future_code", waiting_label: "Ожидает: новая причина Core" }, TASK);
assert.equal(coreLabelWins.ok && coreLabelWins.message, "Ожидает: новая причина Core. Запуск начнётся сам, по порядку.");
const rawCode = interpretLaunchResponse(200, { task_id: TASK, state: "waiting", admitted: false, waiting_reason: "some_future_code" }, TASK);
assert.match(rawCode.ok ? rawCode.message : "", /some_future_code/);
assert.doesNotMatch(rawCode.ok ? rawCode.message : "", NO_POWER);
assert.equal(waitingText("deploy_in_progress"), "Ожидает: идёт деплой этого репозитория.");
assert.equal(waitingText("x", "   "), "Ожидает: причина «x».");
assert.equal(waitingText("<b>", null), "Ожидает: причина «b».");
assert.equal(waitingText("", null), "Ожидает допуска.");
// Core's label wins over the board's own table; punctuation and whitespace are normalised; no prototype keys.
assert.equal(waitingText("repo_conflict", "Ожидает: у задачи не указан репозиторий"), "Ожидает: у задачи не указан репозиторий.");
assert.equal(waitingText("repo_conflict", "  Ожидает:   идёт   деплой!  "), "Ожидает: идёт деплой!");
assert.equal(waitingText("x", "Ожидает: "), "Ожидает: причина «x».");
for (const proto of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
  assert.equal(waitingText(proto), `Ожидает: причина «${proto}».`);
}
const CORE_LABELS: Record<string, string> = {
  resources_cpu: "Ожидает: сервер загружен (CPU)",
  resources_memory: "Ожидает: мало свободной памяти",
  resources_disk: "Ожидает: мало места на диске",
  executor_unavailable: "Ожидает: исполнитель не настроен или недоступен",
  provider_limited: "Ожидает: лимит провайдера исполнителя",
  repo_conflict: "Ожидает: в этой ветке уже идёт работа",
  unknown_repo_capacity: "Ожидает: у задачи не указан репозиторий, а все места для таких задач заняты",
  deploy_in_progress: "Ожидает: идёт деплой этого репозитория",
  resources_unknown: "Ожидает: не удалось измерить ресурсы сервера",
  admission_throttled: "Ожидает: допуск по очереди (не больше N за интервал)",
  safety_ceiling: "Ожидает: достигнут аварийный предел одновременных задач",
  reserved_for_head: "Ожидает: мощность придержана для более приоритетной задачи",
};
for (const [code, label] of Object.entries(CORE_LABELS)) {
  // Without a Core label the board's fallback says the same as Core; with it, Core's text is used verbatim.
  assert.equal(waitingText(code), `${label}.`, code);
  assert.equal(waitingText(code, label), `${label}.`, code);
}
const deliveryFailed = interpretLaunchResponse(200, { task_id: TASK, state: "failed", admitted: true, delivery: { delivered: false, label: "Нет связи с мостом Грога" } }, TASK);
assert.equal(deliveryFailed.ok && deliveryFailed.deliveryFailed, true);
assert.match(deliveryFailed.ok ? deliveryFailed.message : "", /безопасный повтор/);
assert.equal(interpretLaunchResponse(200, { task_id: "22222222-2222-4222-8222-222222222222", state: "sent" }, TASK).ok, false);
assert.equal(interpretLaunchResponse(409, { error: "not_launchable" }).ok, false);
assert.equal(interpretLaunchResponse(404, {}).ok, false);
const unreachable = await handleOwnerLaunchRequest({
  body: { taskId: TASK, idempotencyKey: "abcdefgh-1" }, base, token: "t", actor: owned,
  fetchImpl: (async () => { throw new Error("down"); }) as unknown as typeof fetch,
});
assert.equal(unreachable.status, 503);
assert.equal(unreachable.body.code, "unavailable");

}

proxyChecks()
  .then(() => console.log("ai-company-launch-unit: ok"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// Core 7a6fc09c: bare gateway 404 vs Core's JSON not_found.
{
  const bare = interpretLaunchResponse(404, null);
  assert.equal(bare.ok ? "" : (bare as { code: string }).code, "core_route_unavailable");
  const real = interpretLaunchResponse(404, { error: "not_found" });
  assert.equal(real.ok ? "" : (real as { code: string }).code, "not_found");
}
