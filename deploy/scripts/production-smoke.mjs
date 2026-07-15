#!/usr/bin/env node
/**
 * Production browser smoke tests for deploy pipeline.
 *
 * Env:
 *   AUDIOLAD_SMOKE_BASE_URL
 *   AUDIOLAD_SMOKE_AUTH_MODE=guest-only|full|auto
 *   AUDIOLAD_SMOKE_EMAIL
 *   AUDIOLAD_SMOKE_PASSWORD
 *   AUDIOLAD_SMOKE_SCREENSHOT_DIR
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.AUDIOLAD_SMOKE_BASE_URL ?? "https://audiolad.ru";
const AUTH_MODE = process.env.AUDIOLAD_SMOKE_AUTH_MODE ?? "auto";
const SCREENSHOT_DIR =
  process.env.AUDIOLAD_SMOKE_SCREENSHOT_DIR ??
  "/var/www/audiolad-deploy/logs/smoke-screenshots";

const results = [];
const pass = (name) => results.push({ name, ok: true });
const fail = (name, detail) => results.push({ name, ok: false, detail });

function shouldRunAuth() {
  if (AUTH_MODE === "guest-only") return false;
  if (AUTH_MODE === "full") return true;
  return Boolean(process.env.AUDIOLAD_SMOKE_EMAIL && process.env.AUDIOLAD_SMOKE_PASSWORD);
}

async function collectPageIssues(page) {
  const issues = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
  };

  page.on("pageerror", (error) => {
    issues.pageErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      issues.consoleErrors.push(msg.text());
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.includes("/_next/") || url.endsWith("/")) {
      issues.failedRequests.push({
        url,
        failure: request.failure()?.errorText ?? "unknown",
      });
    }
  });

  return issues;
}

async function assertNoGlobalError(page) {
  const visible = await page
    .getByText(/This page couldn't load|couldn.t load/i)
    .isVisible()
    .catch(() => false);
  if (visible) {
    throw new Error("global_error_visible");
  }
}

async function saveFailureArtifacts(page, label, issues) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(SCREENSHOT_DIR, `${stamp}-${label}.png`);
  const tracePath = path.join(SCREENSHOT_DIR, `${stamp}-${label}.json`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  writeFileSync(
    tracePath,
    JSON.stringify(
      {
        label,
        base: BASE,
        issues,
        url: page.url(),
        bodySnippet: (await page.locator("body").innerText().catch(() => "")).slice(0, 800),
      },
      null,
      2,
    ),
  );
}

async function runGuestScenario(page) {
  const issues = await collectPageIssues(page);

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(5000);
  await assertNoGlobalError(page);

  if (issues.pageErrors.length > 0) {
    throw new Error(`pageerror: ${issues.pageErrors[0]}`);
  }

  const heroVisible = await page
    .getByText("Аудио, которое помогает вернуться к себе")
    .isVisible()
    .catch(() => false);
  if (!heroVisible) {
    throw new Error("guest_hero_missing");
  }
  pass("guest_home");

  await page.goto(`${BASE}/catalog`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(2000);
  await assertNoGlobalError(page);
  pass("catalog");

  const productLink = page.locator('a[href*="/practice/"]').first();
  if (await productLink.count()) {
    await productLink.click();
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    await assertNoGlobalError(page);
    pass("product_card");
  } else {
    pass("product_card_skipped");
  }

  await page.goto(`${BASE}/privacy`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(1500);
  await assertNoGlobalError(page);
  const bottomNavVisible = await page.locator(".bottom-nav").isVisible().catch(() => false);
  if (!bottomNavVisible) {
    throw new Error("legal_bottom_nav_missing");
  }
  pass("legal_page_bottom_nav");

  return issues;
}

async function signIn(page) {
  const email = process.env.AUDIOLAD_SMOKE_EMAIL;
  const password = process.env.AUDIOLAD_SMOKE_PASSWORD;
  if (!email || !password) {
    throw new Error("missing_smoke_credentials");
  }

  await page.goto(`${BASE}/auth/sign-in`, { waitUntil: "load", timeout: 45_000 });
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Введите пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/(profile|my-practices|$|\?)/, { timeout: 30_000 });
  pass("auth_sign_in");
}

async function runAuthScenario(page) {
  const issues = await collectPageIssues(page);
  await signIn(page);

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(10_000);
  await assertNoGlobalError(page);

  if (issues.pageErrors.length > 0) {
    throw new Error(`auth_pageerror: ${issues.pageErrors[0]}`);
  }

  const greetingVisible = await page
    .getByLabel("Персональное приветствие")
    .isVisible()
    .catch(() => false);
  if (!greetingVisible) {
    throw new Error("personal_greeting_missing");
  }
  pass("personal_home");

  for (const route of ["/my-practices", "/playlists", "/profile"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(2000);
    await assertNoGlobalError(page);
    pass(`route_${route.replace(/\//g, "")}`);
  }

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(2000);
  await assertNoGlobalError(page);
  pass("home_return");

  const signOutButton = page.getByRole("button", { name: "Выйти" });
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
  } else {
    await page.goto(`${BASE}/profile`, { waitUntil: "load" });
    const altSignOut = page.getByRole("link", { name: /выйти|sign out/i });
    if (await altSignOut.isVisible().catch(() => false)) {
      await altSignOut.click();
    }
  }

  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(3000);
  await assertNoGlobalError(page);

  const guestHero = await page
    .getByText("Аудио, которое помогает вернуться к себе")
    .isVisible()
    .catch(() => false);
  if (!guestHero) {
    throw new Error("guest_home_after_signout_missing");
  }
  pass("guest_home_after_signout");

  return issues;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let issues = { pageErrors: [], consoleErrors: [], failedRequests: [] };

  try {
    issues = await runGuestScenario(page);

    if (shouldRunAuth()) {
      issues = await runAuthScenario(page);
    } else {
      pass("auth_scenario_skipped");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail("smoke_test", message);
    await saveFailureArtifacts(page, "failure", issues);
  } finally {
    await browser.close();
  }

  const failed = results.filter((item) => !item.ok);
  console.log(JSON.stringify({ base: BASE, results, issues }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
