#!/usr/bin/env node
/**
 * Platform analytics browser E2E against local Next.js server.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3001 AUDIOLAD_ALLOW_PLAYWRIGHT=1 node scripts/platform-analytics-e2e.mjs
 */
import "./lib/assert-playwright-allowed.mjs";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapDataWriteScript } from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/platform-analytics-e2e.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const DOCKER_CONTAINER =
  process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ?? "supabase-db-staging";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

const BASE_URL =
  process.env.BASE_URL ??
  process.env.ANALYTICS_E2E_BASE_URL ??
  "http://127.0.0.1:3001";
const UTM =
  "?utm_source=max&utm_medium=social&utm_campaign=analytics_dev_test&utm_content=browser_e2e";
const PRACTICE_PATH = "/practice/sergey-petrov/dengi-menya-obozhayut";
const LISTEN_PATH = "/listen/sergey-petrov/dengi-menya-obozhayut";
const ts = Date.now();
const TEST_EMAIL = process.env.ANALYTICS_E2E_EMAIL ?? `e2e-analytics-${ts}@audiolad.ru`;
const TEST_PASSWORD = process.env.ANALYTICS_E2E_PASSWORD ?? "E2eAnalyticsPass123!";
const SIGN_UP_SUBMIT = /создать аккаунт|зарегистрироваться/i;
const DIAG_DIR = join(process.cwd(), "tmp", "platform-analytics-e2e-diag");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sql(query) {
  return execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -tAc ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  ).trim();
}

function countPlatformEvents(whereClause) {
  return Number(
    sql(`SELECT COUNT(*) FROM public.analytics_events WHERE event_name NOT LIKE 'promo_%' AND event_name NOT LIKE 'pwa_%' ${whereClause};`),
  );
}

async function readStorage(page) {
  return page.evaluate(() => ({
    anonymousId: localStorage.getItem("audiolad_anonymous_id"),
    sessionId: sessionStorage.getItem("audiolad_analytics_session_id"),
    attribution: localStorage.getItem("audiolad_traffic_attribution"),
  }));
}

async function waitForAnalyticsSession(page, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const storage = await readStorage(page);
    if (storage.sessionId && storage.anonymousId) return storage;
    await page.waitForTimeout(250);
  }
  throw new Error("analytics_session_not_initialized");
}

function attachPageDiagnostics(page, label) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const redirectChain = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 300 && status < 400) {
      redirectChain.push({
        url: response.url(),
        status,
        location: response.headers().location ?? null,
      });
    }
  });

  return {
    label,
    consoleErrors,
    pageErrors,
    failedRequests,
    redirectChain,
    async capture() {
      mkdirSync(DIAG_DIR, { recursive: true });
      const prefix = `${label}-${Date.now()}`;
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      const payload = {
        label,
        baseUrl: BASE_URL,
        url: page.url(),
        title: await page.title(),
        bodyTextPreview: bodyText.slice(0, 3000),
        consoleErrors,
        pageErrors,
        failedRequests,
        redirectChain,
      };
      writeFileSync(join(DIAG_DIR, `${prefix}.json`), JSON.stringify(payload, null, 2));
      await page.screenshot({ path: join(DIAG_DIR, `${prefix}.png`), fullPage: true });
      writeFileSync(join(DIAG_DIR, `${prefix}.html`), await page.content());
      return payload;
    },
  };
}

async function openSignUpPage(page) {
  const response = await page.goto(`${BASE_URL}/auth/sign-up`, {
    waitUntil: "domcontentloaded",
  });
  const signUpForm = page.getByTestId("sign-up-form");
  await signUpForm.waitFor({ state: "visible", timeout: 30000 });
  const submitButton = page.getByRole("button", { name: SIGN_UP_SUBMIT });
  await submitButton.waitFor({ state: "visible", timeout: 10000 });
  return {
    status: response?.status() ?? null,
    submitButton,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const guestDiag = attachPageDiagnostics(page, "guest");
  const sessionResponses = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/analytics/session")) {
      sessionResponses.push({
        status: response.status(),
        body: await response.text().catch(() => ""),
      });
    }
  });

  // Guest scenario
  await context.clearCookies();
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto(`${BASE_URL}/${UTM}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/analytics/session") && response.status() === 200,
      { timeout: 45000 },
    )
    .catch(() => null);
  await page.waitForTimeout(1500);
  const guestStorage = await waitForAnalyticsSession(page).catch(async (error) => {
    const diag = await guestDiag.capture();
    throw new Error(
      `${error.message}; sessionResponses=${JSON.stringify(sessionResponses)}; diagnostics=${JSON.stringify(diag)}`,
    );
  });
  assert(guestStorage.anonymousId, "anonymous_id created");
  assert(guestStorage.sessionId, "session_id created");
  assert(guestStorage.attribution?.includes("max"), "first-touch UTM stored");

  const sessionRow = sql(
    `SELECT utm_source, landing_path, device_type FROM public.analytics_sessions WHERE id='${guestStorage.sessionId}'`,
  );
  assert(sessionRow.includes("max"), `session source max: ${sessionRow}`);

  const pageViewsAfterLanding = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name='page_view'`,
  );
  assert(pageViewsAfterLanding >= 1, "page_view recorded");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const storageAfterReload = await readStorage(page);
  assert(storageAfterReload.sessionId === guestStorage.sessionId, "reload keeps same session");

  const sessionsAfterReload = Number(
    sql(`SELECT COUNT(*) FROM public.analytics_sessions WHERE anonymous_id='${guestStorage.anonymousId}';`),
  );
  assert(sessionsAfterReload === 1, "reload did not create new analytics session");

  await page.goto(`${BASE_URL}/catalog`, { waitUntil: "domcontentloaded" });
  const attributionAfterNav = await readStorage(page);
  assert(attributionAfterNav.attribution?.includes("max"), "UTM preserved after internal nav");

  await page.goto(`${BASE_URL}${PRACTICE_PATH}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/analytics/track") && response.status() === 200,
      { timeout: 30000 },
    )
    .catch(() => null);
  await page.waitForTimeout(1000);
  const practiceViews = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name='practice_view'`,
  );
  assert(practiceViews === 1, `single practice_view expected, got ${practiceViews}`);

  await page.goto(`${BASE_URL}${LISTEN_PATH}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/analytics/track") && response.status() === 200,
      { timeout: 30000 },
    )
    .catch(() => null);
  await page.waitForTimeout(1000);
  const listenViews = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name='listen_page_view'`,
  );
  assert(listenViews === 1, "listen_page_view recorded");
  const playBefore = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name='audio_play_started'`,
  );
  assert(playBefore === 0, "no play before user action");

  const playButton = page
    .locator('button[aria-label="Воспроизвести"], button[aria-label="Пауза"]')
    .first();
  await playButton.waitFor({ state: "visible", timeout: 20000 });

  if ((await playButton.getAttribute("aria-label")) === "Воспроизвести") {
    await playButton.click();
  }

  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return audio && !audio.paused && audio.currentTime > 0.2;
    },
    { timeout: 20000 },
  );

  await page.waitForTimeout(1500);
  const playAfter = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name='audio_play_started'`,
  );
  assert(playAfter === 1, `single audio_play_started expected, got ${playAfter}`);

  if ((await playButton.getAttribute("aria-label")) === "Пауза") {
    await playButton.click();
  }
  await page.waitForTimeout(500);
  if ((await playButton.getAttribute("aria-label")) === "Воспроизвести") {
    await playButton.click();
  }
  await page.waitForTimeout(1000);
  const playAfterPause = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name='audio_play_started'`,
  );
  assert(playAfterPause === 1, "pause/play did not create second start");

  // Seek forward >12s should not instantly grant milestones
  await page.evaluate(() => {
    const audio = document.querySelector("audio");
    if (audio && Number.isFinite(audio.duration) && audio.duration > 30) {
      audio.currentTime = Math.min(audio.duration * 0.9, audio.currentTime + 60);
    }
  });
  await page.waitForTimeout(2000);
  const falseMilestones = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name IN ('audio_progress_25','audio_progress_50','audio_progress_75','audio_progress_90','audio_completed')`,
  );
  assert(falseMilestones === 0, "seek did not create false milestones/completion");

  // Analytics API failure should not break playback
  await page.route("**/api/analytics/track", (route) => route.abort());
  if ((await playButton.getAttribute("aria-label")) === "Пауза") {
    await playButton.click();
  } else {
    await playButton.click();
  }
  await page.waitForTimeout(1500);
  await page
    .waitForFunction(() => {
      const audio = document.querySelector("audio");
      return audio && !audio.paused;
    }, { timeout: 10000 })
    .catch(() => null);
  await page.unroute("**/api/analytics/track");

  // Signup scenario in fresh context with same campaign marker
  const signupContext = await browser.newContext();
  const signupPage = await signupContext.newPage();
  await signupContext.clearCookies();
  await signupPage.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await signupPage.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const signupDiag = attachPageDiagnostics(signupPage, "signup");

  await signupPage.goto(`${BASE_URL}/${UTM}`, { waitUntil: "domcontentloaded" });
  const signupStorage = await waitForAnalyticsSession(signupPage);

  let signUpSubmit;
  try {
    const signUpOpen = await openSignUpPage(signupPage);
    assert(signUpOpen.status === 200, `sign-up HTTP status expected 200, got ${signUpOpen.status}`);
    signUpSubmit = signUpOpen.submitButton;
  } catch (error) {
    const diag = await signupDiag.capture();
    throw new Error(`${error.message}; diagnostics=${JSON.stringify(diag)}`);
  }

  await signupPage.locator('input[autocomplete="given-name"]').click();
  await signupPage.waitForTimeout(500);
  const signupStarted = countPlatformEvents(
    `AND session_id='${signupStorage.sessionId}' AND event_name='signup_started'`,
  );
  assert(signupStarted === 1, "signup_started once");

  await signupPage.locator('input[autocomplete="given-name"]').fill("");
  await signupPage.locator('[data-testid="sign-up-form"]').evaluate((form) => {
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  });
  await signupPage.waitForTimeout(500);
  const signupCompletedOnError = countPlatformEvents(
    `AND session_id='${signupStorage.sessionId}' AND event_name='signup_completed'`,
  );
  assert(signupCompletedOnError === 0, "validation error did not complete signup");

  await signupPage.locator('input[autocomplete="given-name"]').fill("E2E");
  await signupPage.locator('input[autocomplete="family-name"]').fill("Analytics");
  await signupPage.locator('input[autocomplete="email"]').fill(TEST_EMAIL);
  await signupPage.locator('input[autocomplete="new-password"]').fill(TEST_PASSWORD);
  await signUpSubmit.click();
  await signupPage.waitForURL(
    (url) => {
      const path = new URL(url).pathname;
      return (
        path === "/my-practices" ||
        path === "/profile" ||
        path === "/auth/sign-in"
      );
    },
    { timeout: 30000 },
  );

  const userId = sql(`SELECT id FROM auth.users WHERE email='${TEST_EMAIL.replace(/'/g, "''")}'`);
  assert(userId, "test user created");

  await signupPage.waitForTimeout(2000);
  const signupCompleted = countPlatformEvents(
    `AND event_name='signup_completed' AND user_id='${userId}'`,
  );
  assert(signupCompleted === 1, "signup_completed recorded once");

  const linkedSession = sql(
    `SELECT utm_source, user_id FROM public.analytics_sessions WHERE id='${signupStorage.sessionId}'`,
  );
  assert(linkedSession.includes("max"), "signup preserved utm_source=max");
  assert(linkedSession.includes(userId.slice(0, 8)), "session linked to user");

  const linkedEvents = Number(
    sql(`SELECT COUNT(*) FROM public.analytics_events WHERE session_id='${signupStorage.sessionId}' AND user_id='${userId}';`),
  );
  assert(linkedEvents >= 2, "previous session events linked to user_id");

  await signupPage.reload({ waitUntil: "domcontentloaded" });
  await signupPage.waitForTimeout(1500);
  const signupCompletedAfterRefresh = countPlatformEvents(
    `AND event_name='signup_completed' AND user_id='${userId}'`,
  );
  assert(signupCompletedAfterRefresh === 1, "refresh did not duplicate signup_completed");

  assert(
    signupDiag.consoleErrors.every((line) => !/hydration/i.test(line)),
    `hydration console errors: ${JSON.stringify(signupDiag.consoleErrors)}`,
  );
  assert(signupDiag.pageErrors.length === 0, `page errors: ${JSON.stringify(signupDiag.pageErrors)}`);

  await signupContext.close();
  await browser.close();

  console.log(
    JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      testEmail: TEST_EMAIL,
      guestSessionId: guestStorage.sessionId,
      signupSessionId: signupStorage.sessionId,
      userId,
    }),
  );
}

main().catch((error) => {
  console.error("platform-analytics-e2e failed:", error.message);
  process.exit(1);
});
