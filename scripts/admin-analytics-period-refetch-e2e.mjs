/**
 * Browser regression for the /admin analytics period buttons (7 / 30 / Все).
 *
 * Bug: pressing «30» and then «Все» before the first server refresh landed
 * left the page on the previous period's data while the URL and the active
 * button said «Все» (the refresh effect was keyed by a boolean that stayed
 * true). Also checks that a single press refetches, that returning to the
 * rendered period does not leave a stale state, and that no React error
 * (including #185 "Maximum update depth") reaches the console.
 *
 * Runs the real AdminAnalyticsWorkbench under real Next.js navigation with a
 * temporary stub server page (slow for 30d). No database, no secrets. The
 * stub route is created under src/app/period-e2e-harness and always removed.
 *
 *   CHROME=/path/to/chrome node scripts/admin-analytics-period-refetch-e2e.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_DIR = join(ROOT, "src/app/period-e2e-harness");
const SLOW_MS = 2500;
// `next dev` appends agent notes to AGENTS.md; restore it afterwards.
const AGENTS_PATH = join(ROOT, "AGENTS.md");
const AGENTS_BEFORE = readFileSync(AGENTS_PATH, "utf8");

const PAGE = `import { Suspense } from "react";
import AdminAnalyticsWorkbench from "@/components/admin/AdminAnalyticsWorkbench";
import { parseAdminAnalyticsPeriod } from "@/lib/admin/analytics-period";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const p = await searchParams;
  const period = parseAdminAnalyticsPeriod(p.period);
  await new Promise((r) => setTimeout(r, period === "30d" ? ${SLOW_MS} : 150));
  const n = period === "30d" ? 30 : period === "all" ? 999 : 7;
  const overview: any = { realVisitors: n, practiceVisitors: 0, listeners: 0, completers: 0, practiceViews: 0, playStarts: 0, completions: 0, completionByListeners: null,
    weeklyListeningLabel: "-", weeklyListeningPreviousLabel: "-", weeklyListeningDeltaLabel: "-", weeklyListeningNotice: null,
    monthlyListeningLabel: "-", monthlyListeningPreviousLabel: "-", monthlyListeningDeltaLabel: "-", monthlyListeningNotice: null,
    startsPerListener: "0", listenedMs: null, listeningTimeLabel: "-", averagePerListenerLabel: "-", averagePerStartLabel: "-", listeningTimeNotice: null,
    listeningTimeUnmeasured: false, listeningTimePartial: false, newListeners: 0, returningListeners: 0, repeatListeners: 0, wal: 0, previousWal: 0, walDelta: null, mal: 0, previousMal: 0, malDelta: null };
  const summary: any = { period, periodLabel: "DATA-" + period, generatedAt: new Date().toISOString(), includeTest: false,
    filters: { authorId: null, practiceId: null, utmSource: null, deviceType: null }, filterNotes: [], excludedTestVisitors: 0, excludedTestSessions: 0,
    audience: [], kpi: [], productOverview: overview, funnelEvents: [], funnelPeople: [], purchasesPlaceholder: "",
    timeseries: { granularity: "day", points: [], error: null }, filterOptions: { authors: [], practices: [] } };
  return <Suspense fallback={<p>fallback</p>}><AdminAnalyticsWorkbench summary={summary} /></Suspense>;
}
`;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not start");
}

const port = await freePort();
mkdirSync(ROUTE_DIR, { recursive: true });
writeFileSync(join(ROUTE_DIR, "page.tsx"), PAGE);
const dev = spawn("npx", ["next", "dev", "-p", String(port)], {
  cwd: ROOT,
  stdio: "ignore",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy",
  },
  detached: true,
});
let browser;
try {
  const base = `http://localhost:${port}/period-e2e-harness`;
  await waitFor(base, 120000);
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await browser.newPage();
  // Clicks before hydration are lost; dev compiles chunks lazily.
  const hydrated = async () => {
    const button = page.getByRole("button", { name: "30", exact: true }).first();
    for (let i = 0; i < 40; i++) {
      await button.click();
      await page.waitForTimeout(500);
      if (/period=30d/.test(page.url())) break;
    }
    assert.match(page.url(), /period=30d/, "page never became interactive");
    await page.getByRole("button", { name: "7", exact: true }).first().click();
    await page.waitForFunction(() => /DATA-7d/.test(document.body.innerText));
    await page.waitForTimeout(500);
  };
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of (401|403|404|500)/.test(m.text())) {
      errors.push(m.text());
    }
  });
  await page.goto(base);
  await page.waitForSelector("text=/Период: DATA-7d/");
  await hydrated();

  const data = async () =>
    ((await page.locator("text=/Период: DATA-/").first().textContent()) ?? "").match(/DATA-\w+/)?.[0];
  const press = (name) => page.getByRole("button", { name, exact: true }).first().click();
  const settle = async (expected, label) => {
    await page.waitForFunction(
      (want) => document.body.innerText.includes("Период: " + want),
      expected,
      { timeout: 15000 },
    ).catch(() => {});
    assert.equal(await data(), expected, label);
  };

  // 1. A single press of «30» refetches (and shows the pending hint while waiting).
  await press("30");
  await page.waitForSelector('[data-testid="admin-analytics-refreshing"]', { timeout: 3000 });
  await settle("DATA-30d", "«30» must refetch 30d data");
  assert.equal(await page.locator('[data-testid="admin-analytics-refreshing"]').count(), 0);

  // 2. Regression: «7» then «Все» while the first refresh is in flight.
  await press("7");
  await page.waitForTimeout(80);
  await press("Все");
  await settle("DATA-all", "«7» then «Все» before the first refresh lands must end on Все");

  // 3. Regression: «30» (slow) then «Все» before it lands.
  await press("30");
  await page.waitForTimeout(500);
  await press("Все");
  await page.waitForTimeout(SLOW_MS + 1500);
  assert.equal(await data(), "DATA-all", "slow «30» must not leave stale or foreign data");
  assert.match(page.url(), /period=all/);

  // 4. Back to a rendered period.
  await press("7");
  await settle("DATA-7d", "«7» must refetch");

  // 5. Junk filter in the URL does not leave the page permanently stale.
  await page.goto(`${base}?period=7d&authorId=not-a-uuid`);
  await page.waitForSelector("text=/Период: DATA-7d/");
  await hydrated();
  assert.equal(await page.locator('[data-testid="admin-analytics-refreshing"]').count(), 0);
  await press("30");
  await settle("DATA-30d", "«30» after a junk filter must refetch");

  assert.deepEqual(errors, [], "no React/console errors: " + errors.join(" | "));
  console.log("admin-analytics-period-refetch-e2e: ok");
} finally {
  await browser?.close().catch(() => {});
  try {
    process.kill(-dev.pid, "SIGTERM");
  } catch {}
  rmSync(ROUTE_DIR, { recursive: true, force: true });
  writeFileSync(AGENTS_PATH, AGENTS_BEFORE);
}
