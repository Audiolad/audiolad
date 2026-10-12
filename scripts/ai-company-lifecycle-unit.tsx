/**
 * Owner lifecycle buttons on /admin/ai-company (company-core #41, docs/lifecycle-api.md):
 * «Отложить в план», «Снять задачу», «Завершить с доказательствами», «Остановить», «Вернуть на доработку» (company-core #42).
 * Buttons come only from Core allowed_actions; required_decision is shown; the proxy sends one validated command.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import {
  composeAiCompanyBoard,
  lifecycleView,
  parseCompanyStatus,
  parseHistoryFilters,
  type DashboardModel,
  type TaskDetailModel,
} from "../src/lib/admin/ai-company-dashboard";
import {
  LIFECYCLE_OWNER_ONLY,
  handleOwnerLifecycleRequest,
  interpretLifecycleResponse,
  lifecycleCommandPath,
  lifecycleCoreBody,
  validateEvidence,
  validateLifecycleCommand,
  validateReason,
} from "../src/lib/admin/ai-company-lifecycle";

const raw = JSON.parse(readFileSync("scripts/fixtures/ai-company/core29-launch.json", "utf8")) as {
  tasks: Array<Record<string, unknown> & { id: string; title: string }>;
};
const taskOf = (title: string) => {
  const found = raw.tasks.find((task) => task.title === title);
  assert.ok(found, title);
  return found;
};
const planned = taskOf("Обновить справку для авторов");
const started = taskOf("Добавить фильтр в каталог");
const review = taskOf("Исправить время прослушивания");
const sent = taskOf("Добавить экспорт отчёта");
planned.allowed_actions = ["launch", "cancel", "complete"];
planned.required_decision = null;
started.allowed_actions = ["stop"];
review.allowed_actions = ["accept", "rework", "defer", "cancel", "complete"];
review.required_decision = "Приёмка результата: принять или вернуть на доработку";
delete sent.allowed_actions; // an older Core: no list → no lifecycle buttons

const status = parseCompanyStatus(raw)!;
const filters = parseHistoryFilters({});
const model = composeAiCompanyBoard({ data: status, error: null }, { data: null, error: "нет" }, filters).model as DashboardModel;
assert.ok(model);
const all: TaskDetailModel[] = [
  ...model.plan,
  ...model.queue,
  ...model.ownerReview,
  ...model.activeTasks.map((card) => card.detail),
];
const detail = (id: string) => {
  const found = all.find((row) => row.taskId === id);
  assert.ok(found, id);
  return found;
};

// --- View model: exactly Core's list, fixed order, launch/accept/rework excluded (they have their own controls).
assert.deepEqual(detail(planned.id).lifecycle?.actions, ["cancel", "complete"]);
assert.deepEqual(detail(started.id).lifecycle?.actions, ["stop"]);
assert.deepEqual(detail(review.id).lifecycle?.actions, ["defer", "cancel", "complete"]);
assert.equal(detail(review.id).lifecycle?.requiredDecision, "Приёмка результата: принять или вернуть на доработку");
assert.equal(detail(review.id).lifecycle?.expectedStatus, String(review.status));
assert.equal(detail(sent.id).lifecycle, null, "no allowed_actions from Core → no buttons");
assert.equal(lifecycleView({ id: "x", status: "done", allowedActions: [], requiredDecision: null }), null);
assert.deepEqual(lifecycleView({ id: "x", status: "cancel_requested", allowedActions: [], requiredDecision: "Остановка запрошена, ждём" }), {
  expectedStatus: "cancel_requested",
  actions: [],
  requiredDecision: "Остановка запрошена, ждём",
});
assert.deepEqual(lifecycleView({ id: "x", status: "human_gate", allowedActions: ["CANCEL", "nonsense", "defer"].map((a) => a.toLowerCase()), requiredDecision: null })?.actions, ["defer", "cancel"]);

// --- Markup.
function render(canAccept: boolean, tab: "plan" | "working" | "review"): string {
  return renderToStaticMarkup(
    <AiCompanyDashboardView model={model} filters={filters} sourceError={null} acceptanceAvailable canAccept={canAccept} initialTab={tab} onRefresh={() => undefined} />,
  );
}
function blockOf(markup: string, id: string): string {
  const at = markup.indexOf(`>${id}<`);
  assert.ok(at >= 0, id);
  const start = markup.lastIndexOf("<article", at);
  const end = markup.indexOf("</article>", at);
  return markup.slice(start, end);
}
const owner = render(true, "review");
const reviewBlock = blockOf(owner, review.id);
assert.deepEqual([...reviewBlock.matchAll(/data-lifecycle-button="(\w+)"/g)].map((m) => m[1]), ["defer", "cancel", "complete"]);
for (const label of ["Отложить в план", "Снять задачу", "Завершить с доказательствами"]) assert.match(reviewBlock, new RegExp(label));
assert.doesNotMatch(reviewBlock, /data-lifecycle-button="stop"/);
assert.match(reviewBlock, /Нужно решение: <\/span>Приёмка результата/);
assert.doesNotMatch(reviewBlock, /data-lifecycle-dialog/, "dialog opens only on press");
assert.doesNotMatch(owner, /введите|наберите|confirmation phrase/i, "no typed confirmation phrases");
const workingMarkup = render(true, "working");
const startedBlock = blockOf(workingMarkup, started.id);
assert.deepEqual([...startedBlock.matchAll(/data-lifecycle-button="(\w+)"/g)].map((m) => m[1]), ["stop"]);
assert.match(startedBlock, />Остановить</);
// Each lifecycle button appears once per task (no duplicated controls).
for (const action of ["defer", "cancel", "complete"]) {
  assert.equal(reviewBlock.split(`data-lifecycle-button="${action}"`).length - 1, 1, action);
}
const sentBlock = blockOf(workingMarkup, sent.id);
assert.doesNotMatch(sentBlock, /data-lifecycle-button/);
const guest = blockOf(render(false, "review"), review.id);
assert.match(guest, new RegExp(LIFECYCLE_OWNER_ONLY.slice(0, 30)));
assert.match(guest, /data-lifecycle-button="cancel"[^>]*disabled=""|disabled=""[^>]*data-lifecycle-button="cancel"/);

// --- «Нужно решение» (human_gate, 7a6fc09c 21:00): the decision row is the only place such a task is shown,
// so its expanded card carries the same Core lifecycle buttons and required_decision, exactly once.
{
  const gateRaw = JSON.parse(readFileSync("scripts/fixtures/ai-company/core29-launch.json", "utf8")) as typeof raw;
  const gated = gateRaw.tasks.find((task) => task.title === "Добавить фильтр в каталог")!;
  Object.assign(gated, {
    status: "human_gate",
    human_gate: "sergey_manual_review",
    blocked_reason: "Ожидает ручной проверки Сергеем после работ над кабинетом ИИ-компании.",
    board_tab: "working",
    allowed_actions: ["return", "defer", "cancel", "complete"],
    required_decision: "Ручная проверка: sergey_manual_review — Ожидает ручной проверки Сергеем",
  });
  const old = gateRaw.tasks.find((task) => task.title === "Исправить время прослушивания")!;
  Object.assign(old, { status: "human_gate", human_gate: "sergey_manual_review", blocked_reason: "Ожидает ручной проверки Сергеем.", board_tab: "working" });
  delete old.allowed_actions; // an older Core: no list → no buttons on the decision row either
  delete old.required_decision;
  const gateStatus = parseCompanyStatus(gateRaw)!;
  const gateModel = composeAiCompanyBoard({ data: gateStatus, error: null }, { data: null, error: "нет" }, filters).model as DashboardModel;
  const card = gateModel.decisions.find((gate) => gate.taskId === gated.id);
  assert.ok(card, "human_gate task is a decision row");
  assert.deepEqual(card.lifecycle?.actions, ["return", "defer", "cancel", "complete"]);
  assert.equal(card.lifecycle?.expectedStatus, "human_gate");
  const markup = renderToStaticMarkup(
    <AiCompanyDashboardView model={gateModel} filters={filters} sourceError={null} acceptanceAvailable canAccept initialTab="working" onRefresh={() => undefined} />,
  );
  const section = markup.slice(markup.indexOf('data-section="decisions"'), markup.indexOf('data-section="queue"'));
  const rowStart = section.lastIndexOf("<article", section.indexOf(">Добавить фильтр в каталог<"));
  const row = section.slice(rowStart, section.indexOf("</article>", rowStart));
  assert.deepEqual([...row.matchAll(/data-lifecycle-button="(\w+)"/g)].map((m) => m[1]), ["return", "defer", "cancel", "complete"]);
  assert.match(row, />Вернуть на доработку</);
  assert.equal(row.split(`data-lifecycle-button="return"`).length - 1, 1, "one «Вернуть на доработку» per card");
  assert.match(row, /Нужно решение: <\/span>Ручная проверка: sergey_manual_review/);
  assert.equal(section.split(`data-lifecycle-status="human_gate"`).length - 1, 1, "one control block per decision card");
  assert.equal(row.split(`data-lifecycle-button="cancel"`).length - 1, 1, "no duplicated buttons in the card");
  const oldStart = section.lastIndexOf("<article", section.indexOf(">Исправить время прослушивания<"));
  assert.ok(oldStart >= 0);
  assert.doesNotMatch(section.slice(oldStart, section.indexOf("</article>", oldStart)), /data-lifecycle-button/);
}

// --- «Вернуть на доработку» on a task card too (same LifecycleControls), when Core allows it.
{
  const cardRaw = JSON.parse(readFileSync("scripts/fixtures/ai-company/core29-launch.json", "utf8")) as typeof raw;
  const t = cardRaw.tasks.find((task) => task.title === "Исправить время прослушивания")!;
  t.allowed_actions = ["return", "defer", "cancel", "complete"];
  const m = composeAiCompanyBoard({ data: parseCompanyStatus(cardRaw)!, error: null }, { data: null, error: "нет" }, filters).model as DashboardModel;
  const rows: TaskDetailModel[] = [...m.plan, ...m.queue, ...m.ownerReview, ...m.activeTasks.map((c) => c.detail)];
  const row = rows.find((r) => r.taskId === t.id);
  if (row) assert.deepEqual(row.lifecycle?.actions, ["return", "defer", "cancel", "complete"]);
}
// Dialog copy (component source): «Что не так» is required for return; «Завершить» has one plain hint line.
{
  const src = readFileSync("src/components/admin/AiCompanyDashboard.tsx", "utf8");
  assert.match(src, /"Что не так"/);
  assert.match(src, /Только если работа уже сделана и есть доказательство \(ссылка на PR или страницу\)\./);
  assert.doesNotMatch(src, /type="checkbox"/, "no toggles");
}

// --- Validation shared by the dialog and the proxy.
assert.equal(validateReason("", true), "Укажите причину.");
assert.equal(validateReason("", false), null);
assert.ok(validateReason("снять", true));
assert.ok(validateReason("коротко", true));
assert.equal(validateReason("PR #656 закрыт без слияния", true), null);
assert.equal(validateEvidence({ type: "document", reference: "http://x.ru/a", description: "отчёт о проверке" }).ok, false);
assert.equal(validateEvidence({ type: "document", reference: "https://x.ru/a", description: "отчёт о проверке" }).ok, true);
assert.equal(validateEvidence({ type: "document", reference: "https://x.ru/a", description: "мало" }).ok, false);
assert.equal(validateEvidence({ type: "core_record", reference: "not-a-uuid", description: "решение Сергея в Core" }).ok, false);
assert.equal(validateEvidence({ type: "external_confirmation", reference: "msg 42", description: "подтверждение в телеграме" }).ok, false);
assert.equal(validateEvidence({ type: "external_confirmation", reference: "msg 42", description: "подтверждение в телеграме", source: "telegram" }).ok, true);
assert.equal(validateEvidence({ type: "code_delivery", reference: "https://github.com/Audiolad/audiolad/pull/1", description: "слито и выложено" }).ok, false);
const code = validateEvidence({ type: "code_delivery", reference: "https://github.com/Audiolad/audiolad/pull/1", description: "слито и выложено", merge_sha: "ABCDEF12", deploy_sha: "abcdef12", source: "ignored" });
assert.ok(code.ok);
assert.deepEqual(code.ok && code.item, { type: "code_delivery", reference: "https://github.com/Audiolad/audiolad/pull/1", description: "слито и выложено", merge_sha: "abcdef12", deploy_sha: "abcdef12" });

const TASK = "11111111-1111-4111-8111-111111111111";
assert.equal(lifecycleCommandPath(TASK, "cancel"), `/v1/tasks/${TASK}/cancel`);
assert.throws(() => lifecycleCommandPath("../x", "cancel"));
assert.throws(() => lifecycleCommandPath(TASK, "launch" as never));
const base = { taskId: TASK, expectedStatus: "human_gate", idempotencyKey: "abcdefgh-1" };
assert.equal(validateLifecycleCommand({ ...base, action: "defer" }).ok, true, "defer reason optional");
assert.equal(validateLifecycleCommand({ ...base, action: "cancel" }).ok, false, "cancel needs a reason");
assert.equal(validateLifecycleCommand({ ...base, action: "stop", reason: "задача больше не нужна" }).ok, false, "stop needs after");
assert.equal(validateLifecycleCommand({ ...base, action: "stop", reason: "задача больше не нужна", after: "cancel" }).ok, true);
assert.equal(validateLifecycleCommand({ ...base, action: "complete" }).ok, false, "complete needs evidence");
assert.equal(validateLifecycleCommand({ ...base, action: "launch" }).ok, false);
assert.equal(validateLifecycleCommand({ ...base, action: "defer", expectedStatus: "" }).ok, false);
assert.equal((validateLifecycleCommand({ ...base, action: "defer", actor: "sergey" }) as { code: string }).code, "actor_in_body");
assert.equal((validateLifecycleCommand({ ...base, action: "defer", production_verified: true }) as { code: string }).code, "actor_in_body");
assert.equal(validateLifecycleCommand({ ...base, action: "return" }).ok, false, "return needs «что не так»");
assert.equal(validateLifecycleCommand({ ...base, action: "return", reason: "снять" }).ok, false);
const ret = validateLifecycleCommand({ ...base, action: "return", reason: "Мобильный дизайн плейлиста не сделан" });
assert.ok(ret.ok);
assert.deepEqual(ret.ok && lifecycleCoreBody(ret.command), { idempotency_key: "abcdefgh-1", expected_status: "human_gate", reason: "Мобильный дизайн плейлиста не сделан" });
assert.equal(lifecycleCommandPath(TASK, "return"), `/v1/tasks/${TASK}/return`);
const cancelCmd = validateLifecycleCommand({ ...base, action: "cancel", reason: "поглощена другими PR", after: "defer", evidence: [] });
assert.ok(cancelCmd.ok);
assert.deepEqual(cancelCmd.ok && lifecycleCoreBody(cancelCmd.command), { idempotency_key: "abcdefgh-1", expected_status: "human_gate", reason: "поглощена другими PR" });

async function proxyChecks() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (status: number, body: unknown): typeof fetch =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status, json: async () => body } as Response;
    }) as unknown as typeof fetch;
  const owned = { userId: "u1", isOwner: true };
  const evidence = [{ type: "document", reference: "https://example.org/report", description: "отчёт о приёмке" }];
  const ok = await handleOwnerLifecycleRequest({
    body: { ...base, action: "complete", evidence },
    base: "https://core.example/",
    token: "t-secret",
    actor: owned,
    fetchImpl: fakeFetch(200, { task_id: TASK, action: "complete", status: "done", to_status: "done", idempotent: false }),
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.toStatus, "done");
  assert.equal(calls[0].url, `https://core.example/v1/tasks/${TASK}/complete`);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Company-Actor"], "sergey");
  assert.equal(headers.Authorization, "Bearer t-secret");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { idempotency_key: "abcdefgh-1", expected_status: "human_gate", evidence });
  assert.equal(JSON.stringify(ok.body).includes("t-secret"), false, "token never returned");

  const denied = await handleOwnerLifecycleRequest({ body: { ...base, action: "defer" }, base: "https://c", token: "t", actor: { userId: "u2", isOwner: false }, fetchImpl: fakeFetch(200, {}) });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "owner_required");
  assert.equal(calls.length, 1, "no Core call for a non-owner");

  const invalid = await handleOwnerLifecycleRequest({ body: { ...base, action: "cancel", reason: "stop" }, base: "https://c", token: "t", actor: owned, fetchImpl: fakeFetch(200, {}) });
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 1, "no Core call for an invalid reason");

  const stale = await handleOwnerLifecycleRequest({ body: { ...base, action: "defer" }, base: "https://c", token: "t", actor: owned, fetchImpl: fakeFetch(409, { error: "status_changed" }) });
  assert.equal(stale.status, 409);
  assert.match(String(stale.body.message), /уже изменилось/);

  const noConfig = await handleOwnerLifecycleRequest({ body: { ...base, action: "defer" }, base: null, token: null, actor: owned });
  assert.equal(noConfig.status, 503);
  const down = await handleOwnerLifecycleRequest({
    body: { ...base, action: "defer" }, base: "https://c", token: "t", actor: owned,
    fetchImpl: (async () => { throw new Error("down"); }) as unknown as typeof fetch,
  });
  assert.equal(down.body.code, "unavailable");

  assert.equal(interpretLifecycleResponse(404, {}, { taskId: TASK, action: "cancel" }).ok, false);
  assert.equal((interpretLifecycleResponse(404, {}, { taskId: TASK, action: "cancel" }) as { code: string }).code, "core_route_unavailable");
  assert.equal((interpretLifecycleResponse(404, { error: "not_found" }, { taskId: TASK, action: "cancel" }) as { code: string }).code, "not_found");
  assert.equal(interpretLifecycleResponse(200, { task_id: "22222222-2222-4222-8222-222222222222" }, { taskId: TASK, action: "cancel" }).ok, false);
  const replay = interpretLifecycleResponse(200, { task_id: TASK, to_status: "cancelled", idempotent: true }, { taskId: TASK, action: "cancel" });
  assert.ok(replay.ok && replay.idempotent && replay.toStatus === "cancelled");
  const back = interpretLifecycleResponse(200, { task_id: TASK, to_status: "executive_in_progress" }, { taskId: TASK, action: "return" });
  assert.ok(back.ok && /возвращена исполнителю/.test(back.message));
  assert.match(String((interpretLifecycleResponse(409, { error: "production_proof_required" }, { taskId: TASK, action: "complete" }) as { message: string }).message), /на проде/);
}

proxyChecks().then(
  () => console.log("ai-company lifecycle unit: ok"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
