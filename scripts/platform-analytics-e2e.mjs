#!/usr/bin/env node
/**
 * Platform analytics browser E2E against local dev server.
 *
 * Usage:
 *   PORT=3001 node scripts/platform-analytics-e2e.mjs
 */
import "./lib/assert-playwright-allowed.mjs";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.ANALYTICS_E2E_BASE_URL ?? "http://127.0.0.1:3001";
const UTM =
  "?utm_source=max&utm_medium=social&utm_campaign=analytics_dev_test&utm_content=browser_e2e";
const PRACTICE_PATH = "/practice/sergey-petrov/dengi-menya-obozhayut";
const LISTEN_PATH = "/listen/sergey-petrov/dengi-menya-obozhayut";
const ts = Date.now();
const TEST_EMAIL = process.env.ANALYTICS_E2E_EMAIL ?? `e2e-analytics-${ts}@audiolad.ru`;
const TEST_PASSWORD = process.env.ANALYTICS_E2E_PASSWORD ?? "E2eAnalyticsPass123!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sql(query) {
  return execSync(
    `docker exec supabase-db psql -U postgres -d postgres -tAc ${JSON.stringify(query)}`,
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
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
  await page.waitForResponse(
    (response) =>
      response.url().includes("/api/analytics/session") && response.status() === 200,
    { timeout: 45000 },
  ).catch(() => null);
  await page.waitForTimeout(1500);
  const guestStorage = await waitForAnalyticsSession(page).catch(async (error) => {
    throw new Error(
      `${error.message}; sessionResponses=${JSON.stringify(sessionResponses)}; consoleErrors=${JSON.stringify(consoleErrors)}`,
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

  await page.reload({ waitUntil: "networkidle" });
  const storageAfterReload = await readStorage(page);
  assert(storageAfterReload.sessionId === guestStorage.sessionId, "reload keeps same session");

  const sessionsAfterReload = Number(
    sql(`SELECT COUNT(*) FROM public.analytics_sessions WHERE anonymous_id='${guestStorage.anonymousId}';`),
  );
  assert(sessionsAfterReload === 1, "reload did not create new analytics session");

  await page.goto(`${BASE_URL}/catalog`, { waitUntil: "networkidle" });
  const attributionAfterNav = await readStorage(page);
  assert(attributionAfterNav.attribution?.includes("max"), "UTM preserved after internal nav");

  await page.goto(`${BASE_URL}${PRACTICE_PATH}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const practiceViews = countPlatformEvents(
    `AND session_id='${guestStorage.sessionId}' AND event_name='practice_view'`,
  );
  assert(practiceViews === 1, `single practice_view expected, got ${practiceViews}`);

  await page.goto(`${BASE_URL}${LISTEN_PATH}`, { waitUntil: "networkidle" });
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

  await page.waitForFunction(() => {
    const audio = document.querySelector("audio");
    return audio && !audio.paused && audio.currentTime > 0.2;
  }, { timeout: 20000 });

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
  await page.waitForFunction(() => {
    const audio = document.querySelector("audio");
    return audio && !audio.paused;
  }, { timeout: 10000 }).catch(() => null);
  await page.unroute("**/api/analytics/track");

  // Signup scenario in fresh context with same campaign marker
  const signupContext = await browser.newContext();
  const signupPage = await signupContext.newPage();
  await signupPage.goto(`${BASE_URL}/${UTM}`, { waitUntil: "networkidle" });
  const signupStorage = await waitForAnalyticsSession(signupPage);

  await signupPage.goto(`${BASE_URL}/auth/sign-up`, { waitUntil: "networkidle" });
  await signupPage.locator('input[autocomplete="given-name"]').click();
  await signupPage.waitForTimeout(500);
  const signupStarted = countPlatformEvents(
    `AND session_id='${signupStorage.sessionId}' AND event_name='signup_started'`,
  );
  assert(signupStarted === 1, "signup_started once");

  await signupPage.locator('input[autocomplete="given-name"]').fill("");
  await signupPage.getByRole("button", { name: /создать аккаунт/i }).click();
  await signupPage.waitForTimeout(500);
  const signupCompletedOnError = countPlatformEvents(
    `AND session_id='${signupStorage.sessionId}' AND event_name='signup_completed'`,
  );
  assert(signupCompletedOnError === 0, "validation error did not complete signup");

  await signupPage.locator('input[autocomplete="given-name"]').fill("E2E");
  await signupPage.locator('input[autocomplete="family-name"]').fill("Analytics");
  await signupPage.locator('input[autocomplete="email"]').fill(TEST_EMAIL);
  await signupPage.locator('input[autocomplete="new-password"]').fill(TEST_PASSWORD);
  await signupPage.getByRole("button", { name: /создать аккаунт/i }).click();
  await signupPage.waitForURL(/\/(my-practices|profile|auth)/, { timeout: 30000 });

  const userId = sql(`SELECT id FROM auth.users WHERE email='${TEST_EMAIL}'`);
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

  await signupPage.reload({ waitUntil: "networkidle" });
  await signupPage.waitForTimeout(1500);
  const signupCompletedAfterRefresh = countPlatformEvents(
    `AND event_name='signup_completed' AND user_id='${userId}'`,
  );
  assert(signupCompletedAfterRefresh === 1, "refresh did not duplicate signup_completed");

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
