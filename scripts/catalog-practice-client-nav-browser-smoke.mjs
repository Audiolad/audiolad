#!/usr/bin/env node
/**
 * Guest catalog -> practice client navigation smoke.
 *
 * Usage:
 *   AUDIT_BASE_URL=https://audiolad.ru node scripts/catalog-practice-client-nav-browser-smoke.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "https://audiolad.ru";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const pageErrors = [];

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

await page.goto(`${BASE_URL}/catalog`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.setItem("audiolad_analytics_cookies", "granted");
});

const practiceLink = page.locator('a[href^="/practice/"]').first();
const href = await practiceLink.getAttribute("href");

if (!href) {
  throw new Error("catalog did not expose a practice link");
}

await practiceLink.click();
await page.waitForURL((url) => url.pathname.startsWith("/practice/"), {
  timeout: 15000,
});
await page.waitForTimeout(1500);

const title = await page.title();
const hasRetentionCrash = pageErrors.some((message) =>
  message.includes("useFirstSaveRetention must be used within FirstSaveRetentionProvider"),
);

if (hasRetentionCrash) {
  throw new Error(
    `practice page crashed after client nav: ${JSON.stringify({ href, pageErrors })}`,
  );
}

if (!title || title.includes("404") || title.includes("500")) {
  throw new Error(`practice page did not render: ${JSON.stringify({ href, title, pageErrors })}`);
}

await browser.close();
console.log(`catalog-practice-client-nav-browser-smoke: ok (${href})`);
