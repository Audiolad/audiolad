#!/usr/bin/env node
/**
 * Production browser smoke: cookie consent + guest player (Chromium only).
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "https://audiolad.ru";

function isWelcomePracticeTitle(title) {
  return typeof title === "string" && title.includes("Ключ к Изобилию");
}

async function assertButtonHitTarget(page, label) {
  const button = page.getByRole("button", { name: label });
  const box = await button.boundingBox();
  if (!box) {
    throw new Error(`button not found: ${label}`);
  }

  const hit = await page.evaluate(({ x, y, labelText }) => {
    const el = document.elementFromPoint(x, y);
    return el?.textContent?.includes(labelText) ?? false;
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2, labelText: label });

  if (!hit) {
    throw new Error(`elementFromPoint missed button: ${label}`);
  }
}

async function consentDenyFlow() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("audiolad_analytics_cookies"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const grant = page.getByRole("button", { name: "Разрешить" });
  const deny = page.getByRole("button", { name: "Отклонить" });

  if (!(await grant.isVisible())) {
    throw new Error("consent banner not visible");
  }

  const portaled = await page.evaluate(() => {
    const dialog = document.querySelector('[aria-labelledby="analytics-consent-heading"]');
    return dialog?.parentElement === document.body;
  });
  if (!portaled) {
    throw new Error("consent banner not portaled to body");
  }

  await assertButtonHitTarget(page, "Разрешить");
  await assertButtonHitTarget(page, "Отклонить");

  await deny.click();
  if (await grant.isVisible()) {
    throw new Error("deny did not close banner");
  }

  await page.reload({ waitUntil: "networkidle" });
  if (await grant.isVisible()) {
    throw new Error("banner reappeared after deny + reload");
  }

  await browser.close();
  console.log("consent-deny-flow: ok");
}

async function consentGrantFlow() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("audiolad_analytics_cookies"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const grant = page.getByRole("button", { name: "Разрешить" });
  await grant.click();

  const stored = await page.evaluate(() =>
    localStorage.getItem("audiolad_analytics_cookies"),
  );
  if (stored !== "granted") {
    throw new Error(`grant not stored: ${stored}`);
  }

  if (await grant.isVisible()) {
    throw new Error("grant did not close banner");
  }

  await browser.close();
  console.log("consent-grant-flow: ok");
}

async function guestPlayerHomeFlow() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("audiolad:desktop-player-last-session");
    localStorage.setItem("audiolad_analytics_cookies", "granted");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const metrics = await page.evaluate(() => {
    const bar = document.querySelector(".desktop-player-bar");
    const sidebar = document.querySelector('[aria-label="Сейчас играет"]');
    const barTitle = bar?.querySelector("p.font-semibold")?.textContent?.trim() ?? null;
    const sidebarTitle = sidebar?.querySelector("h3")?.textContent?.trim() ?? null;
    const audio = document.querySelector("audio.global-audio-element");
    return {
      emptyBar: bar?.textContent?.includes("Выберите практику, чтобы начать слушать") ?? false,
      emptySidebar: sidebar?.textContent?.includes("Пока ничего не играет") ?? false,
      barTitle,
      sidebarTitle,
      titlesMatch: Boolean(barTitle && sidebarTitle && barTitle === sidebarTitle),
      audioPaused: audio?.paused ?? null,
    };
  });

  if (metrics.emptyBar || metrics.emptySidebar || !metrics.titlesMatch) {
    throw new Error(`guest home player empty: ${JSON.stringify(metrics)}`);
  }
  if (metrics.audioPaused !== true) {
    throw new Error(`autoplay on home: ${JSON.stringify(metrics)}`);
  }

  const playButton = page.locator('.desktop-player-bar button[aria-label="Воспроизвести"]').first();
  await playButton.click();
  await page.waitForTimeout(2500);

  const afterPlay = await page.evaluate(() => {
    const audio = document.querySelector("audio.global-audio-element");
    return {
      paused: audio?.paused ?? null,
      currentSrc: audio?.currentSrc || audio?.src || null,
    };
  });

  if (!afterPlay.currentSrc) {
    throw new Error("no audio src after play");
  }

  await browser.close();
  console.log("guest-player-home-flow: ok", JSON.stringify({ title: metrics.barTitle }));

  if (metrics.barTitle !== "Ключ к Изобилию" && !isWelcomePracticeTitle(metrics.barTitle)) {
    throw new Error(`expected welcome practice title, got ${metrics.barTitle}`);
  }
}

async function guestPlayerClientNavFlow() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/catalog`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("audiolad:desktop-player-last-session");
    localStorage.setItem("audiolad_analytics_cookies", "granted");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const onCatalog = await page.evaluate(() => {
    const barTitle = document.querySelector(".desktop-player-bar p.font-semibold")?.textContent?.trim();
    const sidebarTitle = document.querySelector('[aria-label="Сейчас играет"] h3')?.textContent?.trim();
    const audio = document.querySelector("audio.global-audio-element");
    return {
      barTitle,
      sidebarTitle,
      titlesMatch: Boolean(barTitle && sidebarTitle && barTitle === sidebarTitle),
      audioPaused: audio?.paused ?? null,
      emptyBar: document.querySelector(".desktop-player-bar")?.textContent?.includes("Выберите практику") ?? false,
    };
  });

  if (onCatalog.emptyBar || !onCatalog.titlesMatch || onCatalog.audioPaused !== true) {
    throw new Error(`welcome session missing on catalog: ${JSON.stringify(onCatalog)}`);
  }

  if (!isWelcomePracticeTitle(onCatalog.barTitle)) {
    throw new Error(`catalog welcome title unexpected: ${onCatalog.barTitle}`);
  }

  await page.getByRole("link", { name: "АудиоЛад" }).first().click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.waitForTimeout(3000);

  const after = await page.evaluate(() => {
    const barTitle = document.querySelector(".desktop-player-bar p.font-semibold")?.textContent?.trim();
    const sidebarTitle = document.querySelector('[aria-label="Сейчас играет"] h3')?.textContent?.trim();
    const audio = document.querySelector("audio.global-audio-element");
    return {
      path: location.pathname,
      barTitle,
      sidebarTitle,
      titlesMatch: Boolean(barTitle && sidebarTitle && barTitle === sidebarTitle),
      audioPaused: audio?.paused ?? null,
    };
  });

  if (after.path !== "/" || !after.titlesMatch || after.audioPaused !== true) {
    throw new Error(`client nav failed: ${JSON.stringify(after)}`);
  }

  await browser.close();
  console.log("guest-player-client-nav-flow: ok", JSON.stringify({ title: after.barTitle }));

  if (after.barTitle !== onCatalog.barTitle || !isWelcomePracticeTitle(after.barTitle)) {
    throw new Error(`expected welcome practice after client nav, got ${after.barTitle}`);
  }
}

await consentDenyFlow();
await consentGrantFlow();
await guestPlayerHomeFlow();
await guestPlayerClientNavFlow();
console.log("production-consent-guest-smoke: ok (Chromium only, Safari not tested)");
