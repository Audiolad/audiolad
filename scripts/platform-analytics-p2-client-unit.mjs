#!/usr/bin/env node
/**
 * P2 client/period/dictionary unit checks (no DB).
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

function formatAdminPercent(numerator, denominator) {
  if (denominator <= 0 || numerator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatAdminDelta(current, previous) {
  if (previous === null || previous === undefined) return null;
  const absolute = current - previous;
  if (previous <= 0) {
    if (current <= 0) {
      return { percentLabel: "—", direction: "neutral" };
    }
    return { percentLabel: "н/д", direction: "neutral" };
  }
  const percent = Math.round((absolute / previous) * 100);
  return {
    percentLabel: `${percent > 0 ? "+" : ""}${percent}%`,
    direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat",
  };
}

function resolvePrevious(period, fromIso, toIso) {
  if (period === "today" || period === "all") return null;
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  const durationMs = toMs - fromMs;
  return {
    from: new Date(fromMs - durationMs).toISOString(),
    to: fromIso,
  };
}

function main() {
  const periodSrc = read("src/lib/admin/analytics-period.ts");
  const queries = read("src/lib/admin/analytics-queries.ts");
  const funnel = read("src/components/admin/AdminAnalyticsFunnelPanel.tsx");
  const page = read("src/app/(platform)/admin/page.tsx");

  assert(periodSrc.includes("resolvePreviousAdminAnalyticsPeriodRange"), "prev period");
  assert(periodSrc.includes("formatAdminDelta"), "delta helper");
  assert(formatAdminPercent(0, 0) === "0%", "0/0");
  assert(formatAdminPercent(26, 61) === "43%", "26/61");
  assert(formatAdminDelta(10, 0)?.percentLabel === "н/д", "no infinity");
  assert(formatAdminDelta(0, 0)?.percentLabel === "—", "neutral zero");
  assert(formatAdminDelta(12, 10)?.percentLabel === "+20%", "+20%");

  const prev = resolvePrevious(
    "yesterday",
    "2026-07-24T21:00:00.000Z",
    "2026-07-25T21:00:00.000Z",
  );
  assert(prev?.to === "2026-07-24T21:00:00.000Z", "prev ends at current start");
  assert(prev?.from === "2026-07-23T21:00:00.000Z", "same duration");

  assert(queries.includes("funnelEvents"), "event funnel");
  assert(queries.includes("funnelPeople"), "people funnel");
  assert(queries.includes("session_touch"), "utm attribution");
  assert(funnel.includes("события") || funnel.includes("События"), "events labeled");
  assert(funnel.includes("люди") || funnel.includes("Люди"), "people labeled");
  assert(page.includes("authorId"), "author filter in URL");
  assert(page.includes("practiceId"), "practice filter in URL");
  assert(page.includes("utmSource"), "utm filter in URL");

  // Ensure we don't silently mix conversion types in funnel save step docs
  assert(
    queries.includes('funnelStep(\n        "saves"') ||
      queries.includes('"saves",\n        "Сохранили практику в Аудиотеку"'),
    "saves funnel step",
  );

  console.log("platform-analytics-p2-client-unit: ok");
}

main();
