import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import esbuild from "esbuild";
import { chromium } from "playwright";

const bundlePath = "/tmp/ai-company-board-tabs.js";
await esbuild.build({
  entryPoints: ["scripts/ai-company-board-tabs-entry.tsx"],
  bundle: true,
  format: "iife",
  loader: { ".json": "json" },
  outfile: bundlePath,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": "./src" },
  banner: { js: "const process = { env: { NODE_ENV: 'development' } };" },
});

const cssDir = ".next/static/chunks";
const cssFiles = readdirSync(cssDir).filter((name) => name.endsWith(".css"));
const cssLinks = cssFiles.map((name) => `<link rel="stylesheet" href="/css/${name}">`).join("");
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssLinks}</head><body class="bg-white text-[#25135c]"><main class="mx-auto px-4 py-5"><div id="root"></div></main><div style="height:1800px"></div><script src="/bundle.js"></script></body></html>`;
const bundle = readFileSync(bundlePath);

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  if (url.startsWith("/css/")) {
    const file = join(cssDir, url.slice("/css/".length));
    response.setHeader("content-type", "text/css");
    response.end(readFileSync(file));
    return;
  }
  if (url === "/bundle.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(bundle);
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("no port");
const origin = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const errors: string[] = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(origin, { waitUntil: "networkidle" });
    const tabs = page.locator("[data-board-tabs] [role=tab]");
    if ((await tabs.count()) !== 4) throw new Error("expected four tabs");
    const names = (await tabs.allInnerTexts()).map((text) => text.replace(/\s*\d+$/, "").trim());
    if (names.join("|") !== "План|В работе|Приёмка|Архив") throw new Error("tab names: " + names.join("|"));
    // Sticky: after scrolling the tab bar stays at the top of the viewport.
    await page.evaluate(() => window.scrollTo(0, 600));
    const top = await page.locator("[data-board-tabs]").evaluate((node) => node.getBoundingClientRect().top);
    if (top > 4) throw new Error(`tabs not pinned at ${viewport.width}px: top=${top}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px at ${viewport.width}px`);
    // Only the selected panel is visible.
    const visible = await page.locator("[data-tab-panel]:not([hidden])").count();
    if (visible !== 1) throw new Error("one panel visible, got " + visible);
    await page.locator('[data-board-tab="plan"]').click();
    if ((await page.locator('[data-tab-panel="plan"]').getAttribute("hidden")) !== null) throw new Error("plan panel hidden after click");
    if (!new URL(page.url()).search.includes("tab=plan")) throw new Error("tab not kept in the URL");
    const row = page.locator("[data-plan-task]").first();
    const rowHeight = await row.locator("button").first().evaluate((node) => node.getBoundingClientRect().height);
    if (rowHeight < 44 || rowHeight > 90) throw new Error(`plan row height ${rowHeight}`);
    await row.locator("button").first().click();
    const launch = row.locator("[data-launch-button]");
    await launch.waitFor({ timeout: 3000 });
    const before = await row.locator("[data-stage-badge]").first().innerText();
    // Double click: one request only, and no local status flip.
    await launch.dblclick();
    await page.waitForTimeout(500);
    const calls = await page.evaluate(() => (window as unknown as { __launchCalls: unknown[] }).__launchCalls.length);
    if (calls !== 1) throw new Error(`double click sent ${calls} requests`);
    const after = await row.locator("[data-stage-badge]").first().innerText();
    if (before !== after) throw new Error(`status flipped locally: ${before} -> ${after}`);
    if (!(await row.innerText()).includes("ещё не «выполнено»")) throw new Error("no honest result message");
    await page.screenshot({ path: `/tmp/board-tabs-${viewport.width}.png`, fullPage: false });
    await page.locator('[data-board-tab="review"]').click();
    const review = page.locator('[data-tab-panel="review"] [data-owner-review]');
    if ((await review.count()) !== 1) throw new Error("review tab must hold the one task with real evidence");
    await page.locator('[data-board-tab="working"]').click();
    const more = page.locator('[data-section="more"]');
    if ((await more.getAttribute("open")) !== null) throw new Error("executors/quotas must be collapsed by default");
    await page.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("ai-company-board-tabs-browser: ok");
} finally {
  await browser.close();
  server.close();
}
