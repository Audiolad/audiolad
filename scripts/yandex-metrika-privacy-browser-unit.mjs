#!/usr/bin/env node
/**
 * Browser DOM checks for Yandex Metrika privacy masking (MutationObserver).
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workdir = fileURLToPath(new URL("..", import.meta.url));
const bundleDir = mkdtempSync(join(tmpdir(), "yandex-privacy-"));
const bundlePath = join(bundleDir, "privacy.js");

execFileSync(
  "npx",
  [
    "--yes",
    "esbuild@0.25.0",
    "src/lib/analytics/yandex-metrika-privacy.ts",
    "--bundle",
    "--format=iife",
    "--global-name=YandexPrivacy",
    "--platform=browser",
    `--outfile=${bundlePath}`,
  ],
  { cwd: workdir, stdio: "pipe" },
);

readFileSync(bundlePath, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ path: bundlePath });
await page.evaluate(() => {
  globalThis.YandexPrivacy.resetYandexMetrikaPrivacyMaskingForTests();
  globalThis.YandexPrivacy.setupYandexMetrikaPrivacyMasking();
});

async function assertDynamicMask(createNode, selector, label) {
  await page.evaluate(createNode);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.classList.contains("ym-disable-keys") === true,
    selector,
    { timeout: 3000 },
  );

  const masked = await page.evaluate(
    (sel) => document.querySelector(sel)?.classList.contains("ym-disable-keys") === true,
    selector,
  );

  assert.equal(masked, true, label);
}

await assertDynamicMask(
  () => {
    const input = document.createElement("input");
    input.id = "dynamic-input";
    document.body.appendChild(input);
  },
  "#dynamic-input",
  "bare input",
);

await assertDynamicMask(
  () => {
    const textarea = document.createElement("textarea");
    textarea.id = "dynamic-textarea";
    document.body.appendChild(textarea);
  },
  "#dynamic-textarea",
  "bare textarea",
);

await assertDynamicMask(
  () => {
    const editable = document.createElement("div");
    editable.id = "dynamic-editable";
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
  },
  "#dynamic-editable",
  "contenteditable div",
);

await browser.close();

console.log("yandex-metrika-privacy-browser-unit: ok");
