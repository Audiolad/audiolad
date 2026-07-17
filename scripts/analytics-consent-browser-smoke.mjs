#!/usr/bin/env node
/**
 * Cookie consent banner smoke — Chromium + WebKit when available.
 *
 * Usage:
 *   AUDIT_BASE_URL=http://127.0.0.1:3000 node scripts/analytics-consent-browser-smoke.mjs
 */
import { chromium, webkit } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";

async function runBrowserCheck(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("audiolad_analytics_cookies");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const grant = page.getByRole("button", { name: "Разрешить" });
  const deny = page.getByRole("button", { name: "Отклонить" });

  if (!(await grant.isVisible())) {
    throw new Error(`${name}: consent banner not visible`);
  }

  const portalHost = await page.evaluate(() => {
    const dialog = document.querySelector('[aria-labelledby="analytics-consent-heading"]');
    return dialog?.parentElement === document.body;
  });

  if (!portalHost) {
    throw new Error(`${name}: consent banner is not portaled to body`);
  }

  const grantBox = await grant.boundingBox();
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.textContent?.includes("Разрешить") ?? false;
  }, { x: grantBox.x + grantBox.width / 2, y: grantBox.y + grantBox.height / 2 });

  if (!hit) {
    throw new Error(`${name}: grant button is covered by another layer`);
  }

  await deny.click();
  if (await grant.isVisible()) {
    throw new Error(`${name}: deny did not close banner`);
  }

  const denied = await page.evaluate(() =>
    localStorage.getItem("audiolad_analytics_cookies"),
  );
  if (denied !== "denied") {
    throw new Error(`${name}: deny was not persisted`);
  }

  await page.reload({ waitUntil: "networkidle" });
  if (await grant.isVisible()) {
    throw new Error(`${name}: banner reappeared after deny`);
  }

  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("audiolad_analytics_cookies"));
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  if (!(await grant.isVisible())) {
    throw new Error(`${name}: banner missing after reset`);
  }

  await grant.click();
  const granted = await page.evaluate(() =>
    localStorage.getItem("audiolad_analytics_cookies"),
  );
  if (granted !== "granted") {
    throw new Error(`${name}: grant was not persisted`);
  }

  await browser.close();
  console.log(`${name}: ok`);
}

const browsers = [
  { type: chromium, name: "chromium" },
  { type: webkit, name: "webkit" },
];

for (const { type, name } of browsers) {
  try {
    await runBrowserCheck(type, name);
  } catch (error) {
    if (name === "webkit" && String(error).includes("Executable doesn't exist")) {
      console.warn("webkit: skipped (browser not installed)");
      continue;
    }

    if (name === "webkit" && String(error).includes("Host system is missing dependencies")) {
      console.warn("webkit: skipped (missing host dependencies)");
      continue;
    }

    throw error;
  }
}

console.log("analytics-consent-browser-smoke: ok");
