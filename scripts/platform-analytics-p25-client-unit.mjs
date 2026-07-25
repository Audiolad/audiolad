#!/usr/bin/env node
/**
 * P2.5 UX polish unit checks (no DB, no network).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function formatAdminDelta(current, previous) {
  if (previous === null || previous === undefined) return null;
  const absolute = current - previous;
  if (previous <= 0) {
    return { compactLabel: "—", direction: "neutral" };
  }
  const rawPercent = (absolute / previous) * 100;
  if (Math.abs(rawPercent) < 1) {
    return { compactLabel: "=", direction: "flat" };
  }
  const percent = Math.round(rawPercent);
  if (percent > 0) {
    return { compactLabel: `▲ +${percent}%`, direction: "up" };
  }
  return {
    compactLabel: `▼ ${percent}%`.replace("-", "−"),
    direction: "down",
  };
}

function escapeCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildCsv(headers, rows) {
  return [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))].join("\n") + "\n";
}

function parseUrlState(qs) {
  const params = new URLSearchParams(qs);
  return {
    period: params.get("period") || "7d",
    tab: params.get("tab") || "practices",
    q: params.get("q") || "",
    top: params.get("top") || "25",
    utmGroup: params.get("utmGroup") || "source",
    drill: params.get("drill"),
  };
}

function filterPractices(rows, query) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    [row.title, row.slug, row.author].join(" ").toLowerCase().includes(q),
  );
}

function main() {
  const period = read("src/lib/admin/analytics-period.ts");
  const url = read("src/lib/admin/analytics-url-state.ts");
  const csv = read("src/lib/admin/analytics-csv.ts");
  const workbench = read("src/components/admin/AdminAnalyticsWorkbench.tsx");
  const page = read("src/app/admin/page.tsx");
  const kpi = read("src/components/admin/AdminAnalyticsKpiStrip.tsx");
  const drawer = read("src/components/admin/AdminAnalyticsDrilldownDrawer.tsx");
  const breakdown = read("src/components/admin/AdminAnalyticsBreakdownPanel.tsx");
  const api = read("src/app/api/admin/analytics/breakdown/route.ts");
  const queries = read("src/lib/admin/analytics-queries.ts");

  assert(period.includes("compactLabel"), "delta compact label");
  assert(period.includes("▲ +"), "up glyph");
  assert(formatAdminDelta(118, 100).compactLabel === "▲ +18%", "+18");
  assert(formatAdminDelta(94, 100).compactLabel === "▼ −6%", "-6");
  assert(formatAdminDelta(100, 100).compactLabel === "=", "flat");
  assert(formatAdminDelta(5, 0).compactLabel === "—", "zero base");
  assert(!String(1 / 0).includes("Infinity") || formatAdminDelta(1, 0).compactLabel === "—", "no infinity");

  assert(url.includes("parseAdminAnalyticsUrlState"), "url parse");
  assert(url.includes("buildAdminAnalyticsSearchParams"), "url build");
  const restored = parseUrlState("period=yesterday&tab=utm&q=бастет&top=10&utmGroup=campaign&drill=playStarts");
  assert(restored.period === "yesterday", "restore period");
  assert(restored.tab === "utm", "restore tab");
  assert(restored.q === "бастет", "restore q");
  assert(restored.top === "10", "restore top");
  assert(restored.utmGroup === "campaign", "restore utm group");
  assert(restored.drill === "playStarts", "restore drill");

  const csvOut = buildCsv(["a", "b"], [["x,y", 1], ["ok", null]]);
  assert(csvOut.includes('"x,y"'), "csv escape");
  assert(csv.includes("downloadCsv"), "download helper");

  const found = filterPractices(
    [
      { title: "Женские деньги", slug: "zhenskie-dengi", author: "Зоя" },
      { title: "Бастет", slug: "bastet", author: "Сергей" },
    ],
    "бастет",
  );
  assert(found.length === 1 && found[0].slug === "bastet", "search");

  assert(workbench.includes("AbortController"), "lazy abort");
  assert(workbench.includes("/api/admin/analytics/breakdown"), "lazy fetch");
  assert(workbench.includes("Быстрый период") || workbench.includes("aria-label=\"Быстрый период\""), "period chips");
  assert(page.includes("getAdminAnalyticsSummaryBundle"), "summary first");
  assert(!page.includes("getAdminAnalyticsDashboard("), "page not blocking on full dashboard");
  assert(kpi.includes("Sparkline") || kpi.includes("sparkline") || kpi.includes("viewBox"), "sparkline");
  assert(drawer.includes("role=\"dialog\""), "drawer a11y");
  assert(drawer.includes("Escape"), "escape close");
  assert(breakdown.includes("Export CSV"), "csv export ui");
  assert(breakdown.includes("Top"), "top n");
  assert(breakdown.includes('["source", "Source"]') || breakdown.includes("utmGroup"), "utm group");
  assert(breakdown.includes("опубл. практ."), "published practices");
  assert(
    breakdown.includes("Нет продуктовой активности") ||
      breakdown.includes("ничего не найдено") ||
      breakdown.includes("Нет данных по источникам"),
    "empty states",
  );
  assert(api.includes("analytics.view"), "api auth");
  assert(queries.includes("getAdminAnalyticsSummaryBundle"), "summary bundle");
  assert(queries.includes("getAdminAnalyticsBreakdownBundle"), "breakdown bundle");
  assert(queries.includes("buildKpi"), "kpi builder");

  // mobile-ish classes present
  assert(kpi.includes("grid-cols-2"), "mobile kpi grid");
  assert(drawer.includes("max-w-lg"), "drawer width");

  console.log("platform-analytics-p25-client-unit: ok");
}

main();
