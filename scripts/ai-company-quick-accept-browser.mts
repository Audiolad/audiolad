// Browser check for the row-level «Принять» in «Приёмка». CSS: .next build or QA_CSS_DIR with compiled Tailwind.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import esbuild from "esbuild";
import { chromium } from "playwright";

const bundlePath = "/tmp/ai-company-quick-accept.js";
await esbuild.build({
  entryPoints: ["scripts/ai-company-quick-accept-entry.tsx"],
  bundle: true,
  format: "iife",
  loader: { ".json": "json" },
  outfile: bundlePath,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": "./src" },
  banner: { js: "const process = { env: { NODE_ENV: 'development' } };" },
});

const cssDir = process.env.QA_CSS_DIR || ".next/static/chunks";
const cssFiles = readdirSync(cssDir).filter((name) => name.endsWith(".css"));
const cssLinks = cssFiles.map((name) => `<link rel="stylesheet" href="/css/${name}">`).join("");
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssLinks}</head><body class="bg-white text-[#25135c]"><main class="mx-auto px-4 py-5"><div id="root"></div></main><script src="/bundle.js"></script></body></html>`;
const bundle = readFileSync(bundlePath);
const shots = process.env.QA_SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  if (url.startsWith("/css/")) {
    response.setHeader("content-type", "text/css");
    response.end(readFileSync(join(cssDir, url.slice("/css/".length))));
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

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-gpu"] });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const errors: string[] = [];
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    const panel = page.locator('[data-tab-panel="review"]');
    const rows = panel.locator("[data-owner-review]");
    const before = await rows.count();
    if (before < 2) throw new Error("fixture needs two review rows, got " + before);
    const reviewCount = () => page.locator('[data-tab-count="review"]').innerText();
    const countBefore = await reviewCount();
    const row = rows.first();
    const taskId = await row.getAttribute("data-owner-review");
    const button = row.locator("[data-quick-accept-button]");
    if ((await button.count()) !== 1) throw new Error("no row button");
    // Fits: no page overflow, button inside the row and on the same line as the badge.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px at ${viewport.width}px`);
    const rowBox = (await row.boundingBox())!;
    const btnBox = (await button.boundingBox())!;
    if (btnBox.x + btnBox.width > rowBox.x + rowBox.width + 0.5) throw new Error("button overflows row");
    if (btnBox.height < 36) throw new Error("button too small: " + btnBox.height);
    if (shots) await page.screenshot({ path: `${shots}/quick-accept-${viewport.width}-list.png`, fullPage: true });
    // Click does not toggle the row.
    await button.click();
    if ((await row.locator("[aria-expanded]").first().getAttribute("aria-expanded")) !== "false") throw new Error("button toggled expand");
    const dialog = page.locator("[data-quick-accept-dialog]");
    if (!(await dialog.isVisible())) throw new Error("no confirmation dialog");
    if ((await dialog.locator("input, textarea").count()) !== 0) throw new Error("dialog must not ask for typed text");
    if (shots) await page.screenshot({ path: `${shots}/quick-accept-${viewport.width}-dialog.png` });
    // Cancel sends nothing.
    await dialog.getByRole("button", { name: "Отмена" }).click();
    const calls0 = await page.evaluate(() => (window as unknown as { __acceptCalls: unknown[] }).__acceptCalls.length);
    if (calls0 !== 0) throw new Error("cancel sent a request");
    // First confirm fails: error text shown, row stays.
    await button.click();
    await page.locator("[data-quick-accept-confirm]").click();
    await page.locator("[data-quick-accept-dialog] [data-quick-accept-error]").waitFor();
    const errText = await page.locator("[data-quick-accept-dialog] [data-quick-accept-error]").innerText();
    if (!/Результат изменился/.test(errText)) throw new Error("error text: " + errText);
    if ((await rows.count()) !== before) throw new Error("row removed on failure");
    if (shots) await page.screenshot({ path: `${shots}/quick-accept-${viewport.width}-error.png` });
    // Retry succeeds: row leaves «Приёмка», appears in «Архив».
    await page.locator("[data-quick-accept-confirm]").click();
    await page.waitForFunction((id) => !document.querySelector(`[data-tab-panel="review"] [data-owner-review="${id}"]`), taskId);
    if ((await rows.count()) !== before - 1) throw new Error("review rows not reduced");
    if ((await reviewCount()) === countBefore) throw new Error("review tab count unchanged");
    const calls = await page.evaluate(() => (window as unknown as { __acceptCalls: Array<{ url: string; body: Record<string, unknown> }> }).__acceptCalls);
    if (calls.length !== 2) throw new Error("expected 2 calls, got " + calls.length);
    for (const call of calls) {
      if (call.url !== "/api/admin/ai-company/acceptance") throw new Error("wrong endpoint " + call.url);
      if (call.body.taskId !== taskId || call.body.decision !== "accepted" || call.body.comment !== "") throw new Error("payload " + JSON.stringify(call.body));
      if (typeof call.body.resultVersion !== "string" || !call.body.idempotencyKey) throw new Error("payload " + JSON.stringify(call.body));
    }
    if (calls[0].body.idempotencyKey !== calls[1].body.idempotencyKey) throw new Error("retry must reuse idempotency key");
    await page.locator('[data-board-tab="archive"]').click();
    if ((await page.locator(`[data-tab-panel="archive"] [data-accepted-task="${taskId}"]`).count()) !== 1) throw new Error("not in archive");
    if (shots) await page.screenshot({ path: `${shots}/quick-accept-${viewport.width}-archive.png`, fullPage: true });
    if (errors.length) throw new Error("page errors: " + errors.join("; "));
    await page.close();
  }
  console.log("ai-company-quick-accept-browser: ok");
} finally {
  await browser.close();
  server.close();
}
