#!/usr/bin/env node
/**
 * Real-browser regression for leftover desktop html.scrollTop clipping the
 * listener shell. Does not hit production Next; the fixture is local.
 *
 *   AUDIOLAD_ALLOW_PLAYWRIGHT=1 node scripts/desktop-catalog-shell-navigation-browser.mjs
 */
import "./lib/assert-playwright-allowed.mjs";
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = readFileSync(
  join(repoRoot, "src/lib/navigation/reset-desktop-shell-window-scroll.ts"),
  "utf8",
);
if (!helper.includes("window.scrollTo(0, 0)")) {
  throw new Error("browser fixture is not wired to the desktop window reset helper");
}

const html = `<!doctype html>
<html class="has-shell">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100dvh; overflow: hidden; }
  .listener-app-shell { display: grid; grid-template-columns: 80px 1fr 80px; height: 100dvh; overflow: hidden; padding: 20px 20px 0; box-sizing: border-box; }
  .listener-app-shell__sidebar-slot,
  .listener-app-shell__now-playing-slot { height: 200px; }
  .main { min-width: 0; }
  .desktop-search { height: 52px; }
  .listener-app-shell__center-scroll { height: 400px; overflow-y: auto; }
  .center-inner { height: 1600px; }
</style>
</head>
<body>
  <div class="document-overflow-leak" style="position:absolute;top:0;left:0;width:1px;height:1800px;pointer-events:none" aria-hidden="true"></div>
  <div class="listener-app-shell">
    <div class="listener-app-shell__sidebar-slot">sidebar</div>
    <div class="main">
      <div class="desktop-search">Поиск по каталогу</div>
      <div class="listener-app-shell__center-scroll">
        <div class="center-inner">cards</div>
      </div>
    </div>
    <div class="listener-app-shell__now-playing-slot">now</div>
  </div>
</body>
</html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({
  viewport: { width: 1440, height: 900 },
})).newPage();

await page.setContent(html);

const beforeForce = await page.evaluate(() => ({
  y: window.scrollY,
  scrollHeight: document.documentElement.scrollHeight,
  clientHeight: document.documentElement.clientHeight,
  searchTop: document.querySelector(".desktop-search").getBoundingClientRect().top,
  shellTop: document.querySelector(".listener-app-shell").getBoundingClientRect().top,
  centerTop: document.querySelector(".listener-app-shell__center-scroll").scrollTop,
}));
if (beforeForce.scrollHeight <= beforeForce.clientHeight) {
  throw new Error(
    `fixture must reproduce catalog html.scrollHeight > viewport: ${JSON.stringify(beforeForce)}`,
  );
}

if (beforeForce.y !== 0 || beforeForce.searchTop < 0) {
  throw new Error(`fixture baseline is already shifted: ${JSON.stringify(beforeForce)}`);
}

await page.evaluate(() => {
  document.documentElement.scrollTop = 83;
  window.scrollTo(0, 83);
  document.querySelector(".listener-app-shell__center-scroll").scrollTop = 400;
});

const poisoned = await page.evaluate(() => ({
  y: window.scrollY,
  htmlTop: document.documentElement.scrollTop,
  searchTop: document.querySelector(".desktop-search").getBoundingClientRect().top,
  sidebarTop: document.querySelector(".listener-app-shell__sidebar-slot").getBoundingClientRect().top,
  rightTop: document.querySelector(".listener-app-shell__now-playing-slot").getBoundingClientRect().top,
  shellTop: document.querySelector(".listener-app-shell").getBoundingClientRect().top,
  centerTop: document.querySelector(".listener-app-shell__center-scroll").scrollTop,
}));

if (!(poisoned.y > 0) || poisoned.searchTop >= 0 || poisoned.shellTop >= 0) {
  throw new Error(
    `expected leftover html.scrollTop to clip the desktop shell, got ${JSON.stringify(poisoned)}`,
  );
}

await page.evaluate(() => {
  const desktop = window.matchMedia("(min-width: 1280px)").matches;
  if (!desktop) {
    throw new Error("fixture must run at a desktop viewport");
  }
  const scrollingElement = document.scrollingElement;
  if (scrollingElement) scrollingElement.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
});

const after = await page.evaluate(() => ({
  y: window.scrollY,
  htmlTop: document.documentElement.scrollTop,
  searchTop: document.querySelector(".desktop-search").getBoundingClientRect().top,
  sidebarTop: document.querySelector(".listener-app-shell__sidebar-slot").getBoundingClientRect().top,
  rightTop: document.querySelector(".listener-app-shell__now-playing-slot").getBoundingClientRect().top,
  shellTop: document.querySelector(".listener-app-shell").getBoundingClientRect().top,
  centerTop: document.querySelector(".listener-app-shell__center-scroll").scrollTop,
}));

if (after.y !== 0 || after.shellTop < 0 || after.searchTop < 0 || after.sidebarTop < 0 || after.rightTop < 0) {
  throw new Error(`desktop window reset did not restore shell: ${JSON.stringify(after)}`);
}
if (after.centerTop !== 400) {
  throw new Error(`center-scroll must stay independent: ${JSON.stringify(after)}`);
}

await browser.close();
console.log("desktop-catalog-shell-navigation-browser: ok");
