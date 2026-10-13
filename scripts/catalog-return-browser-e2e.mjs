#!/usr/bin/env node
/**
 * Browser e2e: catalog -> product -> Back keeps the catalog state (web only).
 *
 * Runs the REAL CatalogProductGrid / PracticeBackLink / return-state code in a
 * throw-away copy of the app where /catalog and /api/catalog serve deterministic
 * fixtures (no database, no network, no production data), plus a /p/[id]
 * product stub. Nothing is written into the repository tree.
 *
 * Usage: node scripts/catalog-return-browser-e2e.mjs
 *   E2E_BROWSERS=chromium,webkit   (default: chromium; webkit needs system libs)
 *   E2E_SHOTS=/path/to/dir         save screenshots
 *   E2E_PORT=3197
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, webkit, devices } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fx = join(root, "scripts/fixtures/catalog-return-e2e");
const port = Number(process.env.E2E_PORT ?? 3197);
const base = `http://127.0.0.1:${port}`;
const shots = process.env.E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

// ---- throw-away app copy ----
// Inside the repo so node_modules resolves by normal parent lookup (no symlink).
const work = mkdtempSync(join(root, ".catalog-return-e2e-"));
for (const entry of readdirSync(root)) {
  if (["node_modules", ".git", ".next", "audiolad", ...readdirSync(root).filter((n) => n.startsWith(".catalog-return-e2e-"))].includes(entry)) continue;
  cpSync(join(root, entry), join(work, entry), { recursive: true });
}
const app = join(work, "src/app");
rmSync(join(app, "(platform)"), { recursive: true, force: true });
rmSync(join(app, "(studio)"), { recursive: true, force: true });
rmSync(join(app, "business-app"), { recursive: true, force: true });
rmSync(join(app, "api"), { recursive: true, force: true });
for (const f of ["sitemap.ts", "robots.ts"]) rmSync(join(app, f), { force: true });
rmSync(join(work, "src/proxy.ts"), { force: true });
rmSync(join(work, "src/middleware.ts"), { force: true });
rmSync(join(work, "proxy.ts"), { force: true });
cpSync(join(fx, "data.ts"), join(app, "e2e-data.ts"));
cpSync(join(fx, "layout.tsx"), join(app, "(e2e)/layout.tsx"));
cpSync(join(fx, "catalog"), join(app, "(e2e)/catalog"), { recursive: true });
cpSync(join(fx, "p"), join(app, "(e2e)/p"), { recursive: true });
cpSync(join(fx, "home"), join(app, "(e2e)/home"), { recursive: true });
mkdirSync(join(app, "api/catalog"), { recursive: true });
cpSync(join(fx, "api-catalog/route.ts"), join(app, "api/catalog/route.ts"));

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
  NEXT_TELEMETRY_DISABLED: "1",
};
delete env.SUPABASE_SERVICE_ROLE_KEY;

const server = spawn("node", [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: work, env, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

function cleanup() {
  try { server.kill("SIGKILL"); } catch {}
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {}
}
process.on("exit", cleanup);

async function waitReady() {
  for (let i = 0; i < 90; i += 1) {
    try {
      const r = await fetch(`${base}/api/catalog`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not start:\n${serverLog.slice(0, 3500)}`);
}

// ---- helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (page) =>
  page.$$eval("[data-catalog-product-grid] li a[href^='/p/']", (as) =>
    [...new Set(as.map((a) => a.getAttribute("href")))],
  );
const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));

async function loadPages(page, minItems) {
  for (let i = 0; i < 40; i += 1) {
    if ((await ids(page)).length >= minItems) return;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(350);
  }
  throw new Error(`could not load ${minItems} items, have ${(await ids(page)).length}`);
}

async function scrollToCard(page, index) {
  await page.evaluate((i) => {
    const li = document.querySelectorAll("[data-catalog-product-grid] li")[i];
    li.scrollIntoView({ block: "center" });
  }, index);
  await sleep(500); // let the throttled snapshot write happen
}

async function openCard(page, index) {
  const href = await page.evaluate((i) => {
    const a = document.querySelectorAll("[data-catalog-product-grid] li")[i].querySelector("a[href^='/p/']");
    return a.getAttribute("href");
  }, index);
  await page.locator(`[data-catalog-product-grid] a[href="${href}"]`).first().click();
  await page.waitForURL(`**${href}`);
  await page.getByTestId("product-title").waitFor();
  return href;
}

/** Same list, same order, same place, no jump to top. */
async function expectRestored(page, before, label) {
  await page.waitForSelector("[data-catalog-product-grid] li");
  await sleep(1800); // beyond the retry window and the quiet refresh
  const after = { ids: await ids(page), y: await scrollY(page), url: page.url() };
  assert.equal(after.url, before.url, `${label}: same URL`);
  assert.deepEqual(after.ids.slice(0, before.ids.length), before.ids, `${label}: same results and order`);
  assert.ok(after.ids.length >= before.ids.length, `${label}: loaded pages kept`);
  assert.ok(Math.abs(after.y - before.y) <= 4, `${label}: scroll ${after.y} vs ${before.y}`);
  assert.ok(after.y > 500, `${label}: not reset to the top`);
}

async function snapshotState(page) {
  return { ids: await ids(page), y: await scrollY(page), url: page.url() };
}

async function runScenarios(browserName, launcher, device) {
  const browser = await launcher.launch({ headless: true });
  const context = await browser.newContext({ ...device });
  await context.addInitScript(() => {
    try { localStorage.setItem("audiolad_analytics_cookies", "granted"); } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    // Fake Supabase URL: the realtime socket is expected to be refused.
    if (!/WebSocket/.test(e.message)) errors.push(e.message);
  });
  const shot = (name) => (shots ? page.screenshot({ path: join(shots, `${browserName}-${name}.png`) }) : null);

  // 1) search + filter + sort + several pages -> product -> browser Back
  await page.goto(`${base}/catalog`, { waitUntil: "networkidle" });
  await page.getByTestId("search").fill("Аудио");
  await page.getByTestId("search").press("Enter");
  await page.waitForURL("**/catalog?q=*");
  await page.getByTestId("f-free").click();
  await page.waitForURL("**access=free*");
  await page.getByTestId("s-asc").click();
  await page.waitForURL("**sort=price_asc*");
  await sleep(500);
  assert.match(page.url(), /q=.*access=free.*sort=price_asc/);
  await loadPages(page, 40); // 4 pages of 12 (loaded on demand)
  await scrollToCard(page, 30);
  const s1 = await snapshotState(page);
  assert.ok(s1.ids.length >= 40 && s1.y > 1000, "setup: deep in the list");
  await shot("1-before-open");
  await openCard(page, 30);
  await shot("2-product");
  await page.goBack();
  await expectRestored(page, s1, "browser Back");
  await shot("3-after-back");

  // 2) repeat trips catalog <-> product, now via the standard back link
  for (let trip = 1; trip <= 2; trip += 1) {
    await scrollToCard(page, 30 + trip * 2);
    const s = await snapshotState(page);
    await openCard(page, 30 + trip * 2);
    await page.getByText("← Назад в каталог").click();
    await page.waitForURL("**/catalog?*");
    await expectRestored(page, s, `standard back link, trip ${trip}`);
  }

  // 3) router.back() button, and forward + back again
  {
    await scrollToCard(page, 33);
    const s = await snapshotState(page);
    await openCard(page, 33);
    await page.getByTestId("router-back").click();
    await expectRestored(page, s, "router.back()");
    await page.goForward();
    await page.getByTestId("product-title").waitFor();
    await page.goBack();
    await expectRestored(page, s, "forward then back again");
  }

  // 4) loading continues after returning (cursor kept, no duplicates)
  {
    const before = (await ids(page)).length;
    await loadPages(page, before + 12);
    const list = await ids(page);
    assert.equal(new Set(list).size, list.length, "no duplicate cards after more pages");
  }

  // 5) fresh entry into the catalog (tab-bar style link) starts clean, even with saved state
  {
    await scrollToCard(page, 33);
    await openCard(page, 33);
    // product page has no nav; open the catalog freshly through a normal link click
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.href = "/catalog";
      a.textContent = "fresh";
      a.setAttribute("data-testid", "fresh-link");
      document.body.prepend(a);
    });
    await page.getByTestId("fresh-link").click();
    await page.waitForURL(/\/catalog$/);
    await page.waitForSelector("[data-catalog-product-grid] li");
    await sleep(1500);
    const list = await ids(page);
    assert.equal(list.length, 12, `fresh visit shows only the first page, got ${list.length}`);
    assert.ok((await scrollY(page)) < 50, "fresh visit at the top");
  }

  // 6) a different search is not polluted by an older saved state
  {
    await page.getByTestId("search").fill("сон");
    await page.getByTestId("search").press("Enter");
    await page.waitForURL("**q=*");
    await sleep(800);
    const list = await ids(page);
    assert.ok(list.length <= 12 && list.length > 0, "new search starts from its own first page");
    await openCard(page, 1);
    await page.goBack();
    await page.waitForSelector("[data-catalog-product-grid] li");
    assert.match(page.url(), /q=%D1%81%D0%BE%D0%BD|q=сон/, "back to the second search");
  }

  // 7) stale state (older than the TTL) is ignored
  {
    await page.goto(`${base}/catalog?sort=price_desc`, { waitUntil: "networkidle" });
    await loadPages(page, 30);
    await scrollToCard(page, 25);
    const loadedBefore = (await ids(page)).length;
    await openCard(page, 25);
    await page.evaluate(() => {
      const key = "audiolad:catalog-return:v1";
      const s = JSON.parse(sessionStorage.getItem(key));
      s.savedAt -= 31 * 60 * 1000;
      sessionStorage.setItem(key, JSON.stringify(s));
    });
    await page.goBack();
    await page.waitForSelector("[data-catalog-product-grid] li");
    await sleep(800);
    const loadedAfter = (await ids(page)).length;
    assert.ok(loadedAfter < loadedBefore, `expired state is not restored (${loadedAfter} < ${loadedBefore})`);
  }

  // 8) catalog -> product A -> Home -> product A -> "← Назад в каталог":
  //    history Back would land on Home; it must lead to the catalog.
  {
    const href = await openCard(page, 1);
    await page.getByTestId("to-home").click();
    await page.getByTestId("home-title").waitFor();
    await page.getByTestId("home-to-product").click();
    await page.waitForURL(`**${href}`);
    await page.getByTestId("product-title").waitFor();
    await page.getByText("← Назад в каталог").click();
    await page.waitForSelector("[data-catalog-product-grid] li");
    assert.equal(new URL(page.url()).pathname, "/catalog", "back link after Home leads to the catalog, not Home");
    assert.ok(!page.url().includes("/home"), "did not land on Home");
  }

  // 9) F5 on another page, then a plain click on the "Каталог" tab: fresh catalog,
  //    old snapshot must not be restored.
  {
    await page.goto(`${base}/catalog?sort=price_desc`, { waitUntil: "networkidle" });
    await loadPages(page, 30);
    await scrollToCard(page, 25);
    const deep = (await ids(page)).length;
    assert.ok(deep >= 30, "setup: deep list before leaving");
    await openCard(page, 25);
    await page.getByTestId("to-home").click();
    await page.getByTestId("home-title").waitFor();
    const saved = await page.evaluate(() => sessionStorage.getItem("audiolad:catalog-return:v1"));
    assert.ok(saved, "setup: a snapshot exists");
    await page.reload({ waitUntil: "networkidle" }); // F5 on Home
    await page.getByTestId("home-title").waitFor();
    await page.getByTestId("tab-catalog").click();
    await page.waitForURL(/\/catalog$/);
    await page.waitForSelector("[data-catalog-product-grid] li");
    await sleep(1800);
    assert.equal((await ids(page)).length, 12, "tab click after F5 shows the first page only");
    assert.ok((await scrollY(page)) < 50, "tab click after F5 starts at the top");
  }

  assert.deepEqual(errors, [], `page errors: ${errors.join("; ")}`);
  await browser.close();
  console.log(`catalog-return-browser-e2e [${browserName}]: ok`);
}

try {
  await waitReady();
  const wanted = (process.env.E2E_BROWSERS ?? "chromium").split(",");
  for (const name of wanted) {
    if (name === "chromium") {
      await runScenarios("chromium", chromium, devices["Pixel 7"]);
    } else if (name === "webkit") {
      await runScenarios("webkit", webkit, devices["iPhone 14"]);
    }
  }
  console.log("catalog-return-browser-e2e: ok");
} catch (error) {
  console.error(error);
  console.error("--- dev server log (tail) ---\n" + serverLog.slice(-2500));
  
  process.exitCode = 1;
} finally {
  cleanup();
}
