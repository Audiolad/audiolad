import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import esbuild from "esbuild";
import { chromium, type Page } from "playwright";

const bundlePath = "/tmp/ai-company-task-copy.js";
await esbuild.build({
  entryPoints: ["scripts/ai-company-task-copy-entry.tsx"],
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
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssLinks}</head><body class="bg-white text-[#25135c]"><main class="mx-auto px-4 py-5"><div id="root"></div></main><script src="/bundle.js"></script></body></html>`;
const bundle = readFileSync(bundlePath);

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  if (url.startsWith("/css/")) {
    response.setHeader("content-type", "text/css");
    response.end(readFileSync(fileSafe(url.slice("/css/".length))));
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

function fileSafe(name: string) {
  if (name.includes("..") || name.includes("/")) throw new Error("bad css path");
  return join(cssDir, name);
}

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("no port");
const origin = `http://127.0.0.1:${address.port}/`;

async function expectCopy(page: Page, text: string) {
  if (!text.includes("Кто вправе его принять: Сергей")) throw new Error("copy missing founder owner");
  if (!text.includes("copy-sergey")) throw new Error("copy missing task id");
  if (!text.includes("bc-copy-sergey")) throw new Error("copy missing run id");
  if (!text.includes("КОНЕЦ-ПОСТАНОВКИ")) throw new Error("copy truncated the brief");
  if (!text.includes("https://github.com/Audiolad/audiolad/pull/801")) throw new Error("copy missing PR");
  if (/super-secret-value|Founder Gate/.test(text)) throw new Error("copy leaked a secret or renamed the gate");
  const expanded = await page.locator('[data-section="decisions"] [data-compact-row] button').first().getAttribute("aria-expanded");
  if (expanded !== "true") throw new Error("copy collapsed the row");
}

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  if (pageErrors.length) throw new Error(pageErrors.join("\n"));

  const row = page.locator('[data-section="decisions"] [data-compact-row]').first();
  const toggle = row.locator("button").first();
  await toggle.waitFor();
  const closedText = await toggle.innerText();
  if (closedText.includes("Скопировать")) throw new Error("copy control is inside the closed row");
  const closedHeight = await toggle.evaluate((node) => node.getBoundingClientRect().height);
  if (closedHeight < 48 || closedHeight > 64) throw new Error(`closed row height ${closedHeight}px`);

  await toggle.click();
  const copyButton = row.locator('[data-task-copy="true"] button').first();
  await copyButton.waitFor();
  await copyButton.click();
  await page.locator("text=Скопировано").waitFor();
  await expectCopy(page, await page.evaluate(() => navigator.clipboard.readText()));

  await copyButton.focus();
  await page.keyboard.press("Enter");
  await expectCopy(page, await page.evaluate(() => navigator.clipboard.readText()));
  await page.keyboard.press(" ");
  await expectCopy(page, await page.evaluate(() => navigator.clipboard.readText()));

  await page.evaluate((source) => {
    (0, eval)(source);
  }, 'Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText() { return Promise.reject(new Error("denied")); } } });');
  await copyButton.click();
  const area = row.locator("textarea");
  await area.waitFor();
  await row.locator("text=Выделить всё").click();
  const selected = await area.evaluate(
    (node) => node.selectionStart === 0 && node.selectionEnd === node.value.length && node.value.includes("Сергей"),
  );
  if (!selected) throw new Error("select-all did not select the fallback text");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") throw new Error("fallback collapsed the row");
  const openHeight = await toggle.evaluate((node) => node.getBoundingClientRect().height);
  if (openHeight !== closedHeight) throw new Error(`toggle height changed from ${closedHeight} to ${openHeight}`);

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`mobile horizontal overflow ${overflow}px`);
  console.log("ai-company-task-copy-browser: ok", { closedHeight });
  await context.close();
} finally {
  await browser.close();
  server.close();
}
