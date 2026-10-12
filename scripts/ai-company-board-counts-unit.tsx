/**
 * Core 7a6fc09c: board tab counts equal Core board_tab counts on the live snapshot (stnow-*).
 * Core says plan 0 / working 13 / review 1 / archive 68.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { composeAiCompanyBoard, parseCompanyStatus, parseHistoryFilters, type CompanyStatusLoad } from "../src/lib/admin/ai-company-dashboard";

function raw(name: string): { tasks: Array<{ id: string; board_tab: string; status: string }> } {
  return JSON.parse(readFileSync(`scripts/fixtures/ai-company/${name}.json`, "utf8"));
}
function load(name: string): CompanyStatusLoad {
  const data = parseCompanyStatus(raw(name));
  assert.ok(data, `${name} parses`);
  return { data, error: null };
}

// Core's own count, straight from board_tab (archive = archive view ∪ current, unique ids).
const coreTabs: Record<string, Set<string>> = { plan: new Set(), working: new Set(), review: new Set(), archive: new Set() };
for (const name of ["stnow-current", "stnow-archive"]) for (const task of raw(name).tasks) coreTabs[task.board_tab].add(task.id);
assert.deepEqual(
  Object.fromEntries(Object.entries(coreTabs).map(([tab, ids]) => [tab, ids.size])),
  { plan: 0, working: 13, review: 1, archive: 68 },
);

const { model } = composeAiCompanyBoard(load("stnow-current"), load("stnow-archive"), parseHistoryFilters({}));
assert.ok(model);

// «В работе»: 2 executing + 11 waiting decisions, one card per task.
assert.equal(model.activeTasks.length, 2);
assert.equal(model.queue.length, 0);
assert.equal(model.decisions.length, 11);
const titles = model.decisions.map((card) => card.taskTitle);
assert.equal(new Set(titles).size, titles.length, "one decision card per task");
const ce82 = model.decisions.filter((card) => card.taskTitle.includes("Русификация"));
assert.equal(ce82.length, 1, "ce82ced8 gates merged into one card");
assert.match(ce82[0].reason, / · /, "merged card lists both reasons");
// Gates of tasks Core already archived are not decisions: f7b00288 decision gate, b01cd5d3 CODEX gate.
for (const card of model.decisions) {
  assert.doesNotMatch(`${card.key} ${card.taskTitle}`, /f7b00288|b01cd5d3|CODEX_ACCESS_TOKEN/);
}

assert.equal(model.ownerReview.length, 1);
assert.equal(model.plan.length, 0);

// «Архив» = 34 accepted + 5 closed (4 done, 1 accepted) + 29 cancelled = 68, cancelled kept as history.
assert.equal(model.acceptedArchive.length, 34);
assert.equal(model.closedCount, 5);
assert.equal(model.cancelledArchive.length, 29);
for (const detail of model.cancelledArchive) assert.equal(detail.stageBadge.label, "Отменена");
const coreIds = (tab: string) => [...coreTabs[tab]].sort();
const boardArchiveIds = new Set([
  ...model.acceptedArchive.map((d) => d.taskId),
  ...model.cancelledArchive.map((d) => d.taskId),
]);
assert.equal(boardArchiveIds.size, 34 + 29);
for (const id of boardArchiveIds) assert.ok(coreTabs.archive.has(id), `${id} is archive in Core`);
assert.ok(coreIds("archive").length === 68);

// Rendered tab counters.
const html = renderToStaticMarkup(
  <AiCompanyDashboardView
    model={model}
    filters={parseHistoryFilters({})}
    sourceError={null}
    acceptanceAvailable
    canAccept={false}
    onRefresh={() => undefined}
  />,
);
const count = (tab: string) => Number(html.match(new RegExp(`data-tab-count="${tab}"[^>]*>(\\d+)<`))?.[1]);
assert.deepEqual(
  { plan: count("plan"), working: count("working"), review: count("review"), archive: count("archive") },
  { plan: 0, working: 13, review: 1, archive: 68 },
);
assert.equal((html.match(/data-cancelled-task=/g) ?? []).length, 29);
assert.match(html, /Архив \/ Отменённые/);

console.log("ai-company board counts: 0/13/1/68 OK");
