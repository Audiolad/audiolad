/**
 * Sergey's lifecycle comments on /admin/ai-company cards (company-core #43 owner_comments), 7a6fc09c:
 * «Комментарий Сергея (Отложено в план, 13.10 07:56 МСК): …» once per card on every tab; older ones folded.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import {
  composeAiCompanyBoard,
  formatMoscowShort,
  parseCompanyStatus,
  parseHistoryFilters,
  type BoardTab,
  type DashboardModel,
} from "../src/lib/admin/ai-company-dashboard";

assert.equal(formatMoscowShort("2026-10-13T04:56:58.576Z"), "13.10 07:56 МСК");
assert.equal(formatMoscowShort(null), null);
assert.equal(formatMoscowShort("nonsense"), null);

const raw = JSON.parse(readFileSync("scripts/fixtures/ai-company/core29-launch.json", "utf8")) as {
  tasks: Array<Record<string, unknown> & { id: string; title: string }>;
};
const REASON = "SEO фабрику будем перестраивать по другой концепции там будут работать неживые люди а агенты";
const comment = (action: string, label: string, reason: string, at: string) => ({ action, label, reason, at });
// One task is archived (cancelled) so the «Архив» tab is covered too.
const archived = raw.tasks.find((task) => task.board_tab !== "archive" && task.title === "Добавить экспорт отчёта")!;
Object.assign(archived, { status: "cancelled", board_tab: "archive", allowed_actions: [], required_decision: null });
const byTab: Partial<Record<BoardTab, string>> = {};
const seen = new Set<string>();
for (const task of raw.tasks) {
  const tab = String(task.board_tab ?? "");
  if (!["plan", "working", "review", "archive"].includes(tab) || seen.has(tab)) continue;
  seen.add(tab);
  byTab[tab as BoardTab] = task.id;
  task.owner_comments = [
    comment("defer", "Отложено в план", REASON + " " + tab, "2026-10-13T04:56:58.576Z"),
    comment("return", "Возвращено на доработку", "Дизайн плейлиста на мобильном не сделан", "2026-10-12T19:00:00Z"),
  ];
}
const status = parseCompanyStatus(raw)!;
const filters = parseHistoryFilters({});
const model = composeAiCompanyBoard({ data: status, error: null }, { data: null, error: "нет" }, filters).model as DashboardModel;
assert.ok(Object.keys(byTab).length >= 2, "fixture covers several tabs: " + JSON.stringify(byTab));

let checked = 0;
for (const [tab, id] of Object.entries(byTab) as Array<[BoardTab, string]>) {
  const markup = renderToStaticMarkup(
    <AiCompanyDashboardView model={model} filters={filters} sourceError={null} acceptanceAvailable canAccept initialTab={tab} onRefresh={() => undefined} />,
  );
  const at = markup.indexOf(`>${id}<`);
  assert.ok(at >= 0, `${tab}: task ${id} rendered`);
  const start = markup.lastIndexOf("<article", at);
  const block = markup.slice(start, markup.indexOf("</article>", at));
  assert.equal(block.split("data-owner-comments").length - 1, 1, `${tab}: one comment block per card`);
  assert.match(block, new RegExp(`Комментарий Сергея \\(Отложено в план, 13\\.10 07:56 МСК\\): </span>${REASON} ${tab}`), tab);
  assert.match(block, /Ранее \(1\)/, tab);
  assert.match(block, /Возвращено на доработку, 12\.10 22:00 МСК/, tab);
  checked += 1;
}
assert.equal(checked, 4, "plan, working, review and archive all checked");
console.log("tabs checked:", checked, Object.keys(byTab).join(","));

// No comments from Core → nothing rendered.
const plain = parseCompanyStatus(JSON.parse(readFileSync("scripts/fixtures/ai-company/core29-launch.json", "utf8")))!;
const plainModel = composeAiCompanyBoard({ data: plain, error: null }, { data: null, error: "нет" }, filters).model as DashboardModel;
for (const tab of ["plan", "working", "review", "archive"] as BoardTab[]) {
  const markup = renderToStaticMarkup(
    <AiCompanyDashboardView model={plainModel} filters={filters} sourceError={null} acceptanceAvailable canAccept initialTab={tab} onRefresh={() => undefined} />,
  );
  assert.doesNotMatch(markup, /data-owner-comments/, tab);
}

// «Нужно решение» card shows it too (human_gate task rendered as a decision row).
{
  const gateRaw = JSON.parse(readFileSync("scripts/fixtures/ai-company/core29-launch.json", "utf8")) as typeof raw;
  const gated = gateRaw.tasks.find((task) => task.title === "Добавить фильтр в каталог")!;
  Object.assign(gated, {
    status: "human_gate",
    human_gate: "sergey_manual_review",
    blocked_reason: "Ожидает ручной проверки Сергеем.",
    board_tab: "working",
    allowed_actions: ["return", "defer", "cancel", "complete"],
    required_decision: "Ручная проверка: sergey_manual_review",
    owner_comments: [comment("return", "Возвращено на доработку", "Карточки съезжают на телефоне", "2026-10-13T05:00:00Z")],
  });
  const gm = composeAiCompanyBoard({ data: parseCompanyStatus(gateRaw)!, error: null }, { data: null, error: "нет" }, filters).model as DashboardModel;
  const card = gm.decisions.find((g) => g.taskId === gated.id);
  assert.ok(card);
  assert.equal(card.ownerComments?.[0]?.when, "13.10 08:00 МСК");
  const markup = renderToStaticMarkup(
    <AiCompanyDashboardView model={gm} filters={filters} sourceError={null} acceptanceAvailable canAccept initialTab="working" onRefresh={() => undefined} />,
  );
  const section = markup.slice(markup.indexOf('data-section="decisions"'), markup.indexOf('data-section="queue"'));
  const rowStart = section.lastIndexOf("<article", section.indexOf(">Добавить фильтр в каталог<"));
  const row = section.slice(rowStart, section.indexOf("</article>", rowStart));
  assert.equal(row.split("data-owner-comments").length - 1, 1);
  assert.match(row, /Комментарий Сергея \(Возвращено на доработку, 13\.10 08:00 МСК\): <\/span>Карточки съезжают на телефоне/);
}

console.log("ai-company owner comments unit: ok");
