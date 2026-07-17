#!/usr/bin/env node
/**
 * Guest desktop player bootstrap smoke.
 *
 * Usage:
 *   AUDIT_BASE_URL=http://127.0.0.1:3000 node scripts/guest-player-bootstrap-browser-smoke.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.removeItem("audiolad:desktop-player-last-session");
  localStorage.setItem("audiolad_analytics_cookies", "granted");
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const metrics = await page.evaluate(() => {
  const bar = document.querySelector(".desktop-player-bar");
  const sidebar = document.querySelector('[aria-label="Сейчас играет"]');
  const barTitle = bar?.querySelector("p.font-semibold")?.textContent?.trim() ?? null;
  const sidebarTitle = sidebar?.querySelector("h3")?.textContent?.trim() ?? null;
  const emptyBar = bar?.textContent?.includes("Выберите практику, чтобы начать слушать") ?? false;
  const emptySidebar = sidebar?.textContent?.includes("Пока ничего не играет") ?? false;
  const playButton = bar?.querySelector('button[aria-label="Воспроизвести"]');

  return {
    emptyBar,
    emptySidebar,
    barTitle,
    sidebarTitle,
    titlesMatch: Boolean(barTitle && sidebarTitle && barTitle === sidebarTitle),
    playEnabled: playButton ? !playButton.disabled : false,
  };
});

if (metrics.emptyBar || metrics.emptySidebar) {
  throw new Error(`guest player stayed empty: ${JSON.stringify(metrics)}`);
}

if (!metrics.titlesMatch) {
  throw new Error(`sidebar and bar titles differ: ${JSON.stringify(metrics)}`);
}

if (!metrics.playEnabled) {
  throw new Error(`guest player play control disabled: ${JSON.stringify(metrics)}`);
}

function isWelcomePracticeTitle(title) {
  return typeof title === "string" && title.includes("Ключ к Изобилию");
}

await browser.close();
console.log("guest-player-bootstrap-browser-smoke: ok", JSON.stringify({ title: metrics.barTitle }));

if (!isWelcomePracticeTitle(metrics.barTitle)) {
  throw new Error(`expected welcome practice, got ${metrics.barTitle}`);
}
