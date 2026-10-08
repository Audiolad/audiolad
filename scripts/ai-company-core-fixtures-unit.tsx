/**
 * /admin/ai-company against real Company Core payloads.
 * Fixtures in scripts/fixtures/ai-company are raw buildCompanyStatus() output (see README there):
 * core28-* from company-core PR #28 @16e1a3b2 (user acceptance contract), coreold-* from Core main @142c3b8a.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import {
  ACCEPTED_ARCHIVE_UNAVAILABLE,
  buildAiCompanyDashboard,
  composeAiCompanyBoard,
  parseCompanyStatus,
  parseHistoryFilters,
  type CompanyStatusLoad,
  type DashboardModel,
  type TaskDetailModel,
} from "../src/lib/admin/ai-company-dashboard";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`scripts/fixtures/ai-company/${name}.json`, "utf8"));
}

function load(name: string): CompanyStatusLoad {
  const data = parseCompanyStatus(fixture(name));
  assert.ok(data, `${name} parses`);
  return { data, error: null };
}

function allRows(model: DashboardModel): Array<{ where: string; detail: TaskDetailModel }> {
  return [
    ...model.activeTasks.map((card) => ({ where: "active", detail: card.detail })),
    ...model.queue.map((detail) => ({ where: "queue", detail })),
    ...model.ownerReview.map((detail) => ({ where: "review", detail })),
    ...model.history.map((detail) => ({ where: "history", detail })),
    ...model.acceptedArchive.map((detail) => ({ where: "archive", detail })),
  ];
}

function placesOf(model: DashboardModel, id: string): string[] {
  return allRows(model)
    .filter((row) => row.detail.taskId === id)
    .map((row) => row.where);
}

function render(model: DashboardModel | null, acceptanceAvailable: boolean, canAccept: boolean): string {
  return renderToStaticMarkup(
    <AiCompanyDashboardView
      model={model}
      filters={parseHistoryFilters({})}
      sourceError={null}
      acceptanceAvailable={acceptanceAvailable}
      canAccept={canAccept}
      onRefresh={() => undefined}
    />,
  );
}

function section(markup: string, name: string): string {
  const start = markup.indexOf(`data-section="${name}"`);
  assert.ok(start >= 0, `section ${name} rendered`);
  const end = markup.indexOf("<section", start + 1);
  return markup.slice(start, end < 0 ? undefined : end);
}

function rowMarkup(markup: string, attribute: string, id: string): string {
  const start = markup.indexOf(`${attribute}="${id}"`);
  assert.ok(start >= 0, `${attribute}=${id} rendered`);
  const end = markup.indexOf("</article>", start);
  return markup.slice(start, end);
}

function buttonTag(markup: string, label: string): string {
  const at = markup.indexOf(`>${label}</button>`);
  assert.ok(at >= 0, `button ${label}`);
  return markup.slice(markup.lastIndexOf("<button", at), at);
}

const IN_PROGRESS = "11111111-1111-4111-8111-111111111111";
const PRESENTED = "22222222-2222-4222-8222-222222222222";
const REJECTED = "33333333-3333-4333-8333-333333333333";
const ACCEPTED = "44444444-4444-4444-8444-444444444444";
const REOPENED = "55555555-5555-4555-8555-555555555555";
const LEGACY_DONE = "66666666-6666-4666-8666-666666666666";

// --- The raw contract really is strings plus a separate acceptance object.
const rawCurrent = fixture("core28-current") as { tasks: Array<Record<string, unknown>>; tasks_page: Record<string, unknown> };
assert.equal(rawCurrent.tasks_page.acceptance_view, "current");
for (const task of rawCurrent.tasks) {
  assert.equal(typeof task.presentation, "string");
  assert.equal(typeof task.user_acceptance, "string");
  assert.equal("owner" in task, false, "Core status DTO has no owner field");
}
assert.equal(rawCurrent.tasks.find((task) => task.id === IN_PROGRESS)?.presentation, "in_progress");
const rawRejected = rawCurrent.tasks.find((task) => task.id === REJECTED)!;
assert.equal(rawRejected.user_acceptance, "rejected");
assert.equal((rawRejected.acceptance as Record<string, unknown>).comment, "время прослушивания в админке не отображается");

// --- Core #28: current + archive, as page.tsx composes it.
const filters = parseHistoryFilters({});
const board = composeAiCompanyBoard(load("core28-current"), load("core28-archive"), filters);
assert.equal(board.acceptanceAvailable, true);
assert.equal(board.sourceError, null);
const model = board.model!;
assert.ok(model);
assert.equal(model.acceptedArchiveError, null);

// Blocker 1: presentation "in_progress" is not «На проверке» and has no live buttons.
assert.deepEqual(placesOf(model, IN_PROGRESS), ["active"]);
const inProgress = model.activeTasks.find((card) => card.detail.taskId === IN_PROGRESS)!;
assert.equal(inProgress.detail.acceptance?.applicable, false);
assert.notEqual(inProgress.detail.stageBadge.label, "На проверке");
assert.ok(model.ownerReview.every((row) => row.taskId !== IN_PROGRESS));

// presentation "presented" → «На проверке» with the Core result_version.
assert.deepEqual(placesOf(model, PRESENTED), ["review"]);
const presented = model.ownerReview.find((row) => row.taskId === PRESENTED)!;
assert.equal(presented.stageBadge.label, "На проверке");
assert.equal(presented.acceptance?.resultVersion, rawCurrent.tasks.find((task) => task.id === PRESENTED)?.result_version);
assert.equal(presented.acceptance?.productionVerified, "да");
assert.equal(presented.acceptance?.actor, "Нет данных");

// Reopened (acceptance artifact reopen → user_acceptance none, presentation presented): back to «На проверке».
assert.deepEqual(placesOf(model, REOPENED), ["review"]);

// Blocker 2: rework details come from the acceptance object.
const rejectedPlaces = placesOf(model, REJECTED);
assert.equal(rejectedPlaces.length, 1);
assert.ok(rejectedPlaces[0] === "active" || rejectedPlaces[0] === "queue", "rework stays in the current cycle");
const rejected = allRows(model).find((row) => row.detail.taskId === REJECTED)!.detail;
assert.equal(rejected.stageBadge.label, "На доработке");
assert.equal(rejected.stageBadge.detail, "Замечание: время прослушивания в админке не отображается");
assert.equal(rejected.acceptance?.actor, "sergey");
assert.equal(rejected.acceptance?.comment, "время прослушивания в админке не отображается");
assert.equal(rejected.acceptance?.recordedAt, "07.10.2026, 21:30");
assert.equal(rejected.acceptance?.nextAction, "время прослушивания в админке не отображается");
assert.equal("owner" in (rejected.acceptance ?? {}), false);

// Accepted only in the archive, with time / actor / comment from acceptance{}.
assert.deepEqual(placesOf(model, ACCEPTED), ["archive"]);
const accepted = model.acceptedArchive[0];
assert.equal(model.acceptedArchive.length, 1);
assert.equal(accepted.stageBadge.label, "Принято");
assert.equal(accepted.stageBadge.detail, "Принято 07.10.2026, 15:00 МСК.");
assert.doesNotMatch(accepted.stageBadge.detail ?? "", /не передано/);
assert.equal(accepted.acceptance?.actor, "sergey");
assert.equal(accepted.acceptance?.comment, "ок, принято");
assert.equal(accepted.acceptance?.productionVerified, "да");

// An old done task without acceptance is neither review nor archive.
assert.ok(!placesOf(model, LEGACY_DONE).includes("review"));
assert.ok(!placesOf(model, LEGACY_DONE).includes("archive"));

// Markup: owner session gets live buttons only on presented rows; the in-progress row has none.
const ownerMarkup = render(model, true, true);
const review = section(ownerMarkup, "owner-review");
assert.match(review, /data-owner-review="22222222-2222-4222-8222-222222222222"/);
assert.doesNotMatch(review, /data-owner-review="11111111-1111-4111-8111-111111111111"/);
assert.doesNotMatch(buttonTag(review, "Проверил, принял"), /\sdisabled=""/);
assert.doesNotMatch(buttonTag(review, "Не работает / На доработку"), /\sdisabled=""/);
const inProgressRow = rowMarkup(ownerMarkup, "data-active-task", IN_PROGRESS);
assert.doesNotMatch(inProgressRow, /Проверил, принял|Не работает \/ На доработку|data-owner-acceptance/);
const archiveSection = section(ownerMarkup, "accepted");
assert.match(archiveSection, /data-accepted-task="44444444-4444-4444-8444-444444444444"/);
assert.match(archiveSection, /Вернуть в работу/);
assert.doesNotMatch(ownerMarkup, /Владелец доработки/);
assert.match(ownerMarkup, /Кто подтвердил<\/dt><dd[^>]*>sergey/);

// Any admin with ai_company.view but no owner role: buttons locked, explained.
const adminMarkup = render(model, true, false);
const adminReview = section(adminMarkup, "owner-review");
assert.match(buttonTag(adminReview, "Проверил, принял"), /\sdisabled=""/);
assert.match(buttonTag(adminReview, "Не работает / На доработку"), /\sdisabled=""/);
assert.match(adminReview, /Приёмку записывает только владелец платформы/);
assert.match(buttonTag(section(adminMarkup, "accepted"), "Вернуть в работу"), /\sdisabled=""/);

// Archive fetch failure is "unavailable", never "no accepted results".
const failedArchive = composeAiCompanyBoard(
  load("core28-current"),
  { data: null, error: "Company Core вернул HTTP 502." },
  filters,
);
assert.equal(failedArchive.model?.acceptedArchive.length, 0);
assert.match(failedArchive.model?.acceptedArchiveError ?? "", new RegExp(ACCEPTED_ARCHIVE_UNAVAILABLE.replace(".", "\\.")));
assert.match(failedArchive.model?.acceptedArchiveError ?? "", /HTTP 502/);
const failedMarkup = section(render(failedArchive.model, true, true), "accepted");
assert.match(failedMarkup, /data-archive-unavailable/);
assert.doesNotMatch(failedMarkup, /Принятых результатов в снимке нет/);
// The current list still renders when only the archive failed.
assert.deepEqual(placesOf(failedArchive.model!, PRESENTED), ["review"]);

// Core answering the archive request with another view is not an archive.
const wrongView = composeAiCompanyBoard(load("core28-current"), load("core28-all"), filters);
assert.equal(wrongView.model?.acceptedArchive.length, 0);
assert.match(wrongView.model?.acceptedArchiveError ?? "", /acceptance=archive/);

// acceptance=all builds the same placement as current + archive.
const allModel = buildAiCompanyDashboard(load("core28-all").data!, filters);
assert.deepEqual(placesOf(allModel, ACCEPTED), ["archive"]);
assert.deepEqual(placesOf(allModel, PRESENTED), ["review"]);
assert.deepEqual(placesOf(allModel, IN_PROGRESS), ["active"]);

// --- Old Core (no acceptance contract, ignores ?acceptance): board unchanged, no controls.
const oldBoard = composeAiCompanyBoard(load("coreold-current"), load("coreold-archive"), filters);
assert.equal(oldBoard.acceptanceAvailable, false);
const oldModel = oldBoard.model!;
assert.equal(oldModel.ownerReview.length, 0);
assert.equal(oldModel.acceptedArchive.length, 0);
assert.equal(oldModel.acceptedArchiveError, null);
const plainOld = buildAiCompanyDashboard(load("coreold-all").data!, filters);
assert.deepEqual(
  oldModel.activeTasks.map((card) => card.key),
  plainOld.activeTasks.map((card) => card.key),
);
assert.deepEqual(
  oldModel.history.map((row) => row.key),
  plainOld.history.map((row) => row.key),
);
const oldMarkup = render(oldModel, oldBoard.acceptanceAvailable, true);
assert.doesNotMatch(oldMarkup, /Проверил, принял|Не работает \/ На доработку|Вернуть в работу/);
assert.match(section(oldMarkup, "owner-review"), /Приёмка пока недоступна/);
assert.match(section(oldMarkup, "accepted"), /Приёмка пока недоступна/);

// --- No permanent role cards; one Grok orchestrator plus real executors with evidence.
assert.doesNotMatch(ownerMarkup, /Роли компании|data-section="roles"|data-agent=|Функций со свежей работой/);
const orchestrators = model.executors.filter((executor) => executor.kind === "orchestrator");
assert.deepEqual(orchestrators.map((executor) => executor.id), ["grok"]);
const codex = model.executors.find((executor) => executor.id === "codex")!;
assert.equal(codex.connection, "not_connected");
assert.equal(codex.kind, "dependency");
assert.match(codex.roleNote, /зависимость подключения, не активный исполнитель/);
const cursor = model.executors.find((executor) => executor.id === "cursor")!;
assert.equal(cursor.kind, "executor");
assert.match(cursor.providerModel, /cursor/);
assert.match(cursor.providerModel, /grok-code-fast/);
assert.equal(cursor.runId, "bc-11111111-run");
const executorsSection = section(ownerMarkup, "executors");
assert.match(executorsSection, /data-executor-kind="orchestrator"/);
assert.match(executorsSection, /data-executor-kind="dependency"/);
assert.match(executorsSection, /Провайдер \/ модель/);
const dashboardSource = readFileSync("src/components/admin/AiCompanyDashboard.tsx", "utf8");
assert.doesNotMatch(dashboardSource, /AI_COMPANY_ROLES|Роли компании/);

console.log("ai-company-core-fixtures-unit: ok");
