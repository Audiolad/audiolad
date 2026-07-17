#!/usr/bin/env node
/**
 * Guest player bootstrap after client-side navigation /catalog -> /.
 *
 * Usage:
 *   AUDIT_BASE_URL=http://127.0.0.1:3017 node scripts/guest-player-client-nav-browser-smoke.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3017";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${BASE_URL}/catalog`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.removeItem("audiolad:desktop-player-last-session");
  localStorage.setItem("audiolad_analytics_cookies", "granted");
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const beforeNav = await page.evaluate(() => ({
  path: location.pathname,
  emptyBar: document
    .querySelector(".desktop-player-bar")
    ?.textContent?.includes("Выберите практику, чтобы начать слушать"),
  emptySidebar: document
    .querySelector('[aria-label="Сейчас играет"]')
    ?.textContent?.includes("Пока ничего не играет"),
}));

if (!beforeNav.emptyBar || !beforeNav.emptySidebar) {
  throw new Error(`catalog player should stay empty before home nav: ${JSON.stringify(beforeNav)}`);
}

const homeLink = page.getByRole("link", { name: "АудиоЛад" }).first();
await homeLink.click();
await page.waitForURL((url) => url.pathname === "/");
await page.waitForTimeout(2500);

const afterNav = await page.evaluate(() => {
  const bar = document.querySelector(".desktop-player-bar");
  const sidebar = document.querySelector('[aria-label="Сейчас играет"]');
  const barTitle = bar?.querySelector("p.font-semibold")?.textContent?.trim() ?? null;
  const sidebarTitle = sidebar?.querySelector("h3")?.textContent?.trim() ?? null;
  const audio = document.querySelector("audio.global-audio-element");

  return {
    path: location.pathname,
    emptyBar: bar?.textContent?.includes("Выберите практику, чтобы начать слушать") ?? false,
    emptySidebar: sidebar?.textContent?.includes("Пока ничего не играет") ?? false,
    barTitle,
    sidebarTitle,
    titlesMatch: Boolean(barTitle && sidebarTitle && barTitle === sidebarTitle),
    audioPaused: audio ? audio.paused : null,
    audioSrc: audio?.currentSrc || audio?.src || null,
  };
});

if (afterNav.path !== "/") {
  throw new Error(`expected home path, got ${afterNav.path}`);
}

if (afterNav.emptyBar || afterNav.emptySidebar) {
  throw new Error(`player stayed empty after client nav: ${JSON.stringify(afterNav)}`);
}

if (!afterNav.titlesMatch) {
  throw new Error(`sidebar and bar differ after client nav: ${JSON.stringify(afterNav)}`);
}

if (afterNav.audioPaused !== true) {
  throw new Error(`autoplay started after client nav: ${JSON.stringify(afterNav)}`);
}

await browser.close();
console.log("guest-player-client-nav-browser-smoke: ok");
