import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import esbuild from "esbuild";
import { chromium } from "playwright";

const bundlePath = "/tmp/ai-company-compact-rows.js";
await esbuild.build({
  entryPoints: ["scripts/ai-company-compact-rows-entry.tsx"],
  bundle: true,
  format: "iife",
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
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("a")) event.preventDefault();
      },
      true,
    );
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  const now = page.locator('[data-section="now"] [data-compact-row]').first();
  const toggle = now.locator("button").first();
  try {
    await toggle.waitFor({ timeout: 5000 });
  } catch (error) {
    const body = await page.locator("body").innerText();
    throw new Error(`${pageErrors.join("\n") || "no page error"}\nBODY:\n${body.slice(0, 1500)}`, { cause: error });
  }
  const closedHeight = await toggle.evaluate((node) => node.getBoundingClientRect().height);
  if (closedHeight < 48 || closedHeight > 64) {
    throw new Error(`desktop closed row height ${closedHeight}px, expected 48–64`);
  }
  if ((await toggle.getAttribute("aria-expanded")) !== "false") throw new Error("row starts open");
  await toggle.click();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") throw new Error("click did not expand");
  const panelId = await toggle.getAttribute("aria-controls");
  if (!panelId) throw new Error("missing aria-controls");
  const panel = page.locator(`[id="${panelId}"]`);
  await panel.locator("text=Технический статус").waitFor();
  const link = panel.locator("a").first();
  await link.click();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") throw new Error("link click collapsed the row");
  await toggle.click();
  if ((await toggle.getAttribute("aria-expanded")) !== "false") throw new Error("second click did not collapse");
  await toggle.focus();
  await page.keyboard.press("Enter");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") throw new Error("Enter did not expand");
  await page.keyboard.press(" ");
  if ((await toggle.getAttribute("aria-expanded")) !== "false") throw new Error("Space did not collapse");
  await toggle.click();
  await page.evaluate(() => window.scrollTo(0, 480));
  await page.waitForTimeout(50);
  const rowKey = await now.getAttribute("data-compact-row");
  await page.reload({ waitUntil: "networkidle" });
  const restored = page.locator(`[data-compact-row="${rowKey}"] button`).first();
  await restored.waitFor();
  await page.waitForFunction(
    (key) => document.querySelector(`[data-compact-row="${key}"] button`)?.getAttribute("aria-expanded") === "true",
    rowKey,
  );
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY < 400) throw new Error(`scroll was not restored: ${scrollY}`);
  const other = page.locator('[data-section="queue"] [data-compact-row] button').first();
  if ((await other.getAttribute("aria-expanded")) !== "false") throw new Error("unopened row restored open");

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`mobile horizontal overflow ${overflow}px`);
  console.log("ai-company-compact-rows-browser: ok", { closedHeight, scrollY });
} finally {
  await browser.close();
  server.close();
}
