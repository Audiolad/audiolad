/**
 * «Архив» counter and load-more: the counter is Core's server count (`board_counts`), never the
 * length of a 100-row history page, and «Показать ещё» loads older archived tasks via the cursor.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import {
  ARCHIVE_LIMIT_MAX,
  companyStatusRequestPath,
  composeAiCompanyBoard,
  historyHref,
  loadCompanyStatusWindow,
  mergeStatusHistoryPage,
  parseBoardCounts,
  parseCompanyStatus,
  parseHistoryFilters,
  type CompanyStatus,
  type CompanyStatusLoad,
  type HistoryFilters,
} from "../src/lib/admin/ai-company-dashboard";

type RawStatus = { tasks: Array<Record<string, unknown>>; tasks_page: Record<string, unknown>; [key: string]: unknown };
function raw(name: string): RawStatus {
  return JSON.parse(readFileSync(`scripts/fixtures/ai-company/${name}.json`, "utf8"));
}
function parsed(value: unknown): CompanyStatus {
  const data = parseCompanyStatus(value);
  assert.ok(data, "status parses");
  return data;
}
const load = (value: unknown): CompanyStatusLoad => ({ data: parsed(value), error: null });
const count = (html: string, tab: string) => Number(html.match(new RegExp(`data-tab-count="${tab}"[^>]*>(\\d+)<`))?.[1]);
function render(model: NonNullable<ReturnType<typeof composeAiCompanyBoard>["model"]>, filters: HistoryFilters): string {
  return renderToStaticMarkup(
    <AiCompanyDashboardView model={model} filters={filters} sourceError={null} acceptanceAvailable canAccept={false} onRefresh={() => undefined} />,
  );
}

// 1. URL parsing: archive_limit defaults to 100, steps up, clamps; the default Core path is unchanged.
assert.equal(parseHistoryFilters({}).archiveLimit, 100);
assert.equal(parseHistoryFilters({ archive_limit: "300" }).archiveLimit, 300);
assert.equal(parseHistoryFilters({ archive_limit: "7" }).archiveLimit, 100);
assert.equal(parseHistoryFilters({ archive_limit: "abc" }).archiveLimit, 100);
assert.equal(parseHistoryFilters({ archive_limit: "999999" }).archiveLimit, ARCHIVE_LIMIT_MAX);
assert.equal(companyStatusRequestPath(parseHistoryFilters({}), "current"), "/v1/status?acceptance=current");
assert.equal(companyStatusRequestPath(parseHistoryFilters({}), "current", { historyLimit: 100 }), "/v1/status?acceptance=current");
assert.match(companyStatusRequestPath(parseHistoryFilters({}), "archive", { historyLimit: 200 }), /history_limit=200/);
assert.match(companyStatusRequestPath(parseHistoryFilters({}), "archive", { historyLimit: 900 }), /history_limit=500/);
assert.equal(historyHref(parseHistoryFilters({ agent: "cto" }), { archiveLimit: 200 }), "/admin/ai-company?agent=cto&archive_limit=200");
assert.equal(historyHref(parseHistoryFilters({ archive_limit: "200" }), {}), "/admin/ai-company?archive_limit=200");

// 2. board_counts parsing: only non-negative integers.
assert.equal(parseBoardCounts(null), null);
assert.equal(parseBoardCounts({ archive: -1, plan: "3" }), null);
assert.deepEqual(parseBoardCounts({ plan: 87, working: 7, review: 0, archive: 130, archive_by_status: { accepted: 90, cancelled: 36, done: 4, bad: 1.5 } }), {
  plan: 87,
  working: 7,
  review: 0,
  archive: 130,
  archiveByStatus: { accepted: 90, cancelled: 36, done: 4 },
});

// 3. Live shape of the bug: Core returns a 100-row history page, 130 archived tasks in total.
const boardCounts = { plan: 0, working: 13, review: 1, archive: 130, archive_by_status: { accepted: 90, cancelled: 36, done: 4 }, scope: "all_tasks", source: "server_count" };
function capped(name: string): RawStatus {
  const value = raw(name);
  value.tasks_page = { ...value.tasks_page, history_included: 100, history_complete: false, omitted_history_count: 30 };
  value.board_counts = boardCounts;
  return value;
}
{
  const filters = parseHistoryFilters({});
  const { model } = composeAiCompanyBoard(load(capped("stnow-current")), load(capped("stnow-archive")), filters);
  assert.ok(model);
  assert.equal(model.boardCounts?.archive, 130);
  assert.deepEqual(model.archivePage, { loaded: 100, total: 130, nextLimit: 200 });
  const html = render(model, filters);
  assert.equal(count(html, "archive"), 130, "«Архив» shows the server count, not the loaded rows");
  assert.equal(count(html, "working"), 13);
  assert.equal(count(html, "review"), 1);
  assert.match(html, /Загружено из Company Core: 100 из 130 архивных задач \(новые сверху\)\./);
  assert.match(html, /id="ai-company-archive-more"/);
  assert.match(html, /href="\/admin\/ai-company\?archive_limit=200&amp;tab=archive"[^>]*>Показать ещё</);
  const moreBlock = html.slice(html.indexOf('id="ai-company-archive-more"'), html.indexOf("</div>", html.indexOf('id="ai-company-archive-more"')));
  const windowLine = html.match(/data-archive-window[^>]*>([^<]*)</)?.[1] ?? "";
  assert.match(moreBlock, /–/, "load-more hint uses an en dash");
  assert.doesNotMatch(`${moreBlock}${windowLine}`, /—/, "no em dash in the new archive texts");
}

// 4. Whole archive loaded: no load-more link; counter still from Core.
{
  const done = (name: string) => {
    const value = raw(name);
    value.tasks_page = { ...value.tasks_page, history_included: 130, history_complete: true, omitted_history_count: 0 };
    value.board_counts = boardCounts;
    return value;
  };
  const filters = parseHistoryFilters({ archive_limit: "200" });
  const { model } = composeAiCompanyBoard(load(done("stnow-current")), load(done("stnow-archive")), filters);
  assert.ok(model);
  assert.deepEqual(model.archivePage, { loaded: 130, total: 130, nextLimit: null });
  const html = render(model, filters);
  assert.equal(count(html, "archive"), 130);
  assert.match(html, /Загружено из Company Core: 130 из 130/);
  assert.doesNotMatch(html, /Показать ещё/);
  assert.match(html, /name="archive_limit" value="200"/, "filter form keeps the archive window");
}

// 5. Older Core without board_counts: the counter keeps the previous formula (stnow = 68).
{
  const { model } = composeAiCompanyBoard(load(raw("stnow-current")), load(raw("stnow-archive")), parseHistoryFilters({}));
  assert.ok(model);
  assert.equal(model.boardCounts, null);
  assert.equal(count(render(model, parseHistoryFilters({})), "archive"), 68);
}

// 6. Cursor chaining: a Core that clamps to 100 rows is paged with history_before until the window is full.
async function cursorChaining() {
  const template = raw("stnow-current").tasks.find((task) => task.status === "cancelled");
  assert.ok(template);
  const all = Array.from({ length: 250 }, (_, i) => ({
    ...template,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    title: `Архивная задача ${i}`,
    updated_at: new Date(Date.UTC(2026, 9, 20) - i * 60_000).toISOString(),
    events: [],
  }));
  const requests: string[] = [];
  const fetchPage = async (path: string) => {
    requests.push(path);
    const url = new URL(path, "https://core.test");
    const before = url.searchParams.get("history_before");
    const start = before ? all.findIndex((task) => String(task.updated_at) < before) : 0;
    const rows = all.slice(start, start + 100); // old Core: history_limit clamped to 100
    const complete = start + rows.length >= all.length;
    return load({
      ...raw("stnow-current"),
      tasks: rows,
      board_counts: { ...boardCounts, archive: 250 },
      tasks_page: {
        active_complete: true,
        history_included: rows.length,
        history_limit: 100,
        history_next_before: rows.at(-1)?.updated_at ?? null,
        history_complete: complete,
        omitted_history_count: all.length - start - rows.length,
        acceptance_view: "current",
      },
    });
  };
  const window = await loadCompanyStatusWindow(fetchPage, parseHistoryFilters({ archive_limit: "200" }), "current");
  assert.ok(window.data);
  assert.equal(window.data.tasks.length, 200);
  assert.equal(window.data.completeness.historyIncluded, 200);
  assert.equal(window.data.completeness.historyComplete, false);
  assert.equal(new Set(window.data.tasks.map((task) => task.id)).size, 200, "no duplicates across pages");
  assert.equal(window.data.tasks[0].id, all[0].id, "newest first");
  assert.equal(window.data.tasks[199].id, all[199].id);
  assert.equal(requests.length, 2);
  assert.match(requests[0], /history_limit=200/);
  assert.match(requests[1], /history_before=/);
  assert.doesNotMatch(requests[1], /history_limit/, "100 is the Core default page");

  const full = await loadCompanyStatusWindow(fetchPage, parseHistoryFilters({ archive_limit: "300" }), "current");
  assert.equal(full.data?.tasks.length, 250);
  assert.equal(full.data?.completeness.historyComplete, true);

  // Default window: exactly one request, unchanged path.
  requests.length = 0;
  const first = await loadCompanyStatusWindow(fetchPage, parseHistoryFilters({}), "current");
  assert.equal(first.data?.tasks.length, 100);
  assert.deepEqual(requests, ["/v1/status?acceptance=current"]);

  // A failed later page keeps the rows already loaded.
  let calls = 0;
  const flaky = async (path: string) => (calls++ === 0 ? fetchPage(path) : { data: null, error: "down" });
  const partial = await loadCompanyStatusWindow(flaky, parseHistoryFilters({ archive_limit: "300" }), "current");
  assert.equal(partial.data?.tasks.length, 100);
  assert.equal(partial.error, null);

  // Merge dedupes ids that appear on both pages.
  const a = parsed({ ...raw("stnow-current"), tasks: all.slice(0, 3), tasks_page: { history_included: 3, history_complete: false } });
  const b = parsed({ ...raw("stnow-current"), tasks: all.slice(2, 5), tasks_page: { history_included: 3, history_complete: true } });
  assert.equal(mergeStatusHistoryPage(a, b).tasks.length, 5);
}

cursorChaining().then(
  () => console.log("ai-company archive pagination unit: ok"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
