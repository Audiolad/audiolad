#!/usr/bin/env node
/**
 * Production browser smoke: cookie consent (Chromium only).
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "https://audiolad.ru";

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

await consentDenyFlow();
await consentGrantFlow();
console.log("production-consent-guest-smoke: ok (Chromium only, Safari not tested)");
