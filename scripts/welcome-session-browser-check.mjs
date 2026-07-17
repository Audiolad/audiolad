#!/usr/bin/env node
/**
 * Welcome session browser verification — all release gate scenarios.
 *
 * Usage:
 *   AUDIT_BASE_URL=http://127.0.0.1:3046 node scripts/welcome-session-browser-check.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3046";
const WELCOME_TITLE = "Ключ к Изобилию";
const EXPLICIT_TITLE = "Код Притяжения";
const EXPLICIT_AUTHOR = "sergey-and-zoya";
const EXPLICIT_SLUG = "kod-prityazheniya";

function loadEnv() {
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function dismissConsent(page) {
  const allow = page.getByRole("button", { name: "Разрешить" });
  const reject = page.getByRole("button", { name: "Отклонить" });

  if (await allow.count()) {
    await allow.first().click({ timeout: 3000 }).catch(() => {});
    return;
  }

  if (await reject.count()) {
    await reject.first().click({ timeout: 3000 }).catch(() => {});
  }
}

function buildAuthCookie(baseUrl, session) {
  const env = loadEnv();
  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const host = new URL(baseUrl).hostname;
  return {
    domain: host,
    path: "/",
    name: `sb-${projectRef}-auth-token`,
    value: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    }),
    httpOnly: false,
    secure: host !== "localhost" && host !== "127.0.0.1",
    sameSite: "Lax",
  };
}

async function getAuthCookiesForEmail(baseUrl, email) {
  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !linkData?.properties?.hashed_token) {
    throw new Error(`auth_link_failed:${email}`);
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (verifyError || !data.session) {
    throw new Error(`auth_verify_failed:${email}`);
  }

  return [buildAuthCookie(baseUrl, data.session)];
}

async function createAuthUserWithoutHistory() {
  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const email = `welcome-smoke-${Date.now()}@audiolad.test`;
  const password = `Smoke-${Date.now()}-Aa1!`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(`create_user_failed:${createError?.message ?? "unknown"}`);
  }

  await admin
    .from("practice_audio_progress")
    .delete()
    .eq("user_id", created.user.id);

  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: signInData, error: signInError } =
    await pub.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.session) {
    throw new Error(`sign_in_failed:${signInError?.message ?? "unknown"}`);
  }

  return {
    email,
    userId: created.user.id,
    cookie: buildAuthCookie(BASE_URL, signInData.session),
  };
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const desktopBar = document.querySelector(".desktop-player-bar");
    const nowPlaying = document.querySelector('[aria-label="Сейчас играет"]');
    const miniPlayer = document.querySelector(".global-mini-player");
    const audioElements = document.querySelectorAll("audio");

    return {
      desktopBarText: desktopBar?.textContent?.slice(0, 600) ?? "",
      nowPlayingText: nowPlaying?.textContent?.slice(0, 600) ?? "",
      emptyBarText: desktopBar?.textContent?.includes(
        "Выберите практику, чтобы начать слушать",
      ),
      emptySidebarText: nowPlaying?.textContent?.includes("Пока ничего не играет"),
      restoringBar: Boolean(desktopBar?.querySelector("[aria-busy='true']")),
      miniPlayerVisible:
        Boolean(miniPlayer) && getComputedStyle(miniPlayer).display !== "none",
      desktopBarVisible:
        Boolean(desktopBar) && getComputedStyle(desktopBar).display !== "none",
      audioCount: audioElements.length,
      audioPaused: audioElements[0]?.paused ?? null,
      audioCurrentTime: audioElements[0]?.currentTime ?? null,
      guestProgressKeys: Object.keys(localStorage).filter((key) =>
        key.startsWith("audiolad_gp:"),
      ),
      desktopPersistKey: localStorage.getItem("audiolad:desktop-player-last-session"),
    };
  });
}

async function waitForWelcomeDesktop(page, timeoutMs = 25000) {
  await page.waitForFunction(
    (title) => {
      const bar = document.querySelector(".desktop-player-bar");
      const sidebar = document.querySelector('[aria-label="Сейчас играет"]');
      return (
        (bar?.textContent ?? "").includes(title) &&
        (sidebar?.textContent ?? "").includes(title)
      );
    },
    WELCOME_TITLE,
    { timeout: timeoutMs },
  );
}

async function resetGuestContext(context, page) {
  await context.clearCookies();
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("audiolad_analytics_cookies", "denied");
  });
}

async function testGuestWelcomeDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const welcomeResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/listen/welcome-session") && response.ok(),
  );
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await dismissConsent(page);
  await welcomeResponse;
  await waitForWelcomeDesktop(page);

  const metrics = await collectMetrics(page);
  assert(metrics.audioCount === 1, "guest desktop: one audio element");
  assert(metrics.audioPaused === true, "guest desktop: no autoplay");
  assert(metrics.audioCurrentTime === 0, "guest desktop: currentTime is 0");
  assert(!metrics.emptyBarText, "guest desktop: bar is not empty");
  assert(!metrics.emptySidebarText, "guest desktop: sidebar is not empty");
}

async function testAuthWithoutHistory(page, context) {
  const authUser = await createAuthUserWithoutHistory();

  const apiEvents = [];
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/listen/resume-session")) {
      apiEvents.push("resume");
    }
    if (url.includes("/api/listen/welcome-session") && response.ok()) {
      apiEvents.push("welcome");
    }
  });

  let welcomeFetchStarted = false;
  await page.route("**/api/listen/welcome-session", async (route) => {
    welcomeFetchStarted = true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await resetGuestContext(context, page);
  await context.addCookies([authUser.cookie]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const resumeResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/listen/resume-session") && !response.ok(),
  );
  const welcomeResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/listen/welcome-session") && response.ok(),
  );
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await dismissConsent(page);
  await resumeResponse;
  assert(welcomeFetchStarted, "auth no history: welcome API requested after resume");
  await welcomeResponse;
  assert(
    apiEvents.indexOf("resume") < apiEvents.indexOf("welcome"),
    "auth no history: resume check finishes before welcome session loads",
  );

  await waitForWelcomeDesktop(page);

  const ready = await collectMetrics(page);
  assert(ready.audioPaused === true, "auth no history: no autoplay");
  assert(!ready.desktopPersistKey, "auth no history: no persistence before play");

  await page.waitForFunction(
    () => {
      const button = document.querySelector(
        '.desktop-player-bar button[aria-label="Воспроизвести"]',
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    { timeout: 20000 },
  );
  await page
    .locator('.desktop-player-bar button[aria-label="Воспроизвести"]')
    .first()
    .click({ force: true });
  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return Boolean(audio?.src);
    },
    { timeout: 20000 },
  );
  await page.evaluate(async () => {
    const audio = document.querySelector("audio");
    if (audio?.paused) {
      await audio.play();
    }
  });
  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return audio && !audio.paused;
    },
    { timeout: 20000 },
  );

  await page.waitForFunction(
    () =>
      Boolean(localStorage.getItem("audiolad:desktop-player-last-session")) ||
      Boolean(document.querySelector("audio")?.currentTime),
    { timeout: 15000 },
  );

  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: progressRows } = await admin
    .from("practice_audio_progress")
    .select("id")
    .eq("user_id", authUser.userId)
    .limit(1);
  assert(
    Boolean(progressRows?.length) ||
      Boolean(await page.evaluate(() =>
        localStorage.getItem("audiolad:desktop-player-last-session"),
      )),
    "auth no history: persistence starts after first play",
  );

  await page.unroute("**/api/listen/welcome-session");
}

async function testAuthWithHistory(page, context) {
  await resetGuestContext(context, page);
  await context.addCookies(await getAuthCookiesForEmail(BASE_URL, "1@audiolad.ru"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(4000);

  const metrics = await collectMetrics(page);
  assert(
    !metrics.nowPlayingText.includes(WELCOME_TITLE) || metrics.emptySidebarText,
    "auth with history: welcome must not replace history",
  );
}

async function testExplicitListenPath(page, context) {
  await resetGuestContext(context, page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `${BASE_URL}/listen/${EXPLICIT_AUTHOR}/${EXPLICIT_SLUG}`,
    { waitUntil: "networkidle" },
  );
  await dismissConsent(page);
  await page.waitForTimeout(2000);

  const listenPageText = await page.evaluate(() => document.body.textContent ?? "");
  assert(listenPageText.includes(EXPLICIT_TITLE), "listen path loads explicit product");
  assert(!listenPageText.includes(WELCOME_TITLE), "listen path excludes welcome");

  await page.getByRole("link", { name: "Главная" }).click();
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForTimeout(2000);
  const afterNav = await collectMetrics(page);
  assert(
    afterNav.desktopBarText.includes(EXPLICIT_TITLE) ||
      afterNav.nowPlayingText.includes(EXPLICIT_TITLE),
    "welcome does not return after client navigation home",
  );
  assert(!afterNav.desktopBarText.includes(WELCOME_TITLE), "explicit session persists on home");
  assert(afterNav.audioCount === 1, "listen path: one audio element");
}

async function testExplicitCatalogFlow(page, context) {
  await resetGuestContext(context, page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await dismissConsent(page);
  await waitForWelcomeDesktop(page);

  await page.goto(`${BASE_URL}/catalog`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: EXPLICIT_TITLE }).first().click();
  await page.waitForURL(`**/practice/${EXPLICIT_AUTHOR}/${EXPLICIT_SLUG}**`);
  await page.getByRole("link", { name: "Начать слушать" }).click();
  await page.waitForURL(`**/listen/${EXPLICIT_AUTHOR}/${EXPLICIT_SLUG}**`);
  await page.waitForTimeout(2500);

  const pageText = await page.evaluate(() => document.body.textContent ?? "");
  assert(pageText.includes(EXPLICIT_TITLE), "catalog flow loads selected product");

  await page.getByRole("link", { name: "Главная" }).click();
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForTimeout(2000);
  const home = await collectMetrics(page);
  assert(
    home.desktopBarText.includes(EXPLICIT_TITLE) ||
      home.nowPlayingText.includes(EXPLICIT_TITLE),
    "catalog flow keeps explicit product on home",
  );
  assert(!home.desktopBarText.includes(WELCOME_TITLE), "catalog flow replaces welcome");
}

async function testPromoPracticeLink(page, context) {
  await resetGuestContext(context, page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const promoUrl =
    `${BASE_URL}/practice/${EXPLICIT_AUTHOR}/${EXPLICIT_SLUG}` +
    "?utm_source=smoke&utm_medium=browser&utm_campaign=welcome-gate&utm_content=promo";

  await page.goto(promoUrl, { waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.getByRole("link", { name: "Начать слушать" }).click();
  await page.waitForURL(`**/listen/${EXPLICIT_AUTHOR}/${EXPLICIT_SLUG}**`);
  await page.waitForTimeout(2500);

  const pageText = await page.evaluate(() => document.body.textContent ?? "");
  assert(pageText.includes(EXPLICIT_TITLE), "promo link loads selected product");

  await page.getByRole("link", { name: "Главная" }).click();
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForTimeout(2000);
  const home = await collectMetrics(page);
  assert(
    home.desktopBarText.includes(EXPLICIT_TITLE) ||
      home.nowPlayingText.includes(EXPLICIT_TITLE),
    "promo flow keeps explicit product on home",
  );
  assert(!home.desktopBarText.includes(WELCOME_TITLE), "promo link excludes welcome");
}

async function testWelcomeApiFallback(page, context) {
  await resetGuestContext(context, page);
  await page.setViewportSize({ width: 1440, height: 900 });

  let welcomeCalls = 0;
  await page.route("**/api/listen/welcome-session", async (route) => {
    welcomeCalls += 1;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "not_found" }),
    });
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(4000);

  const metrics = await collectMetrics(page);
  assert(welcomeCalls === 1, "welcome API fallback: single welcome request");
  assert(metrics.emptyBarText, "welcome API fallback: desktop empty state");
  assert(metrics.emptySidebarText, "welcome API fallback: sidebar empty state");
  assert(metrics.audioCount === 1, "welcome API fallback: app stays alive with one audio");

  await page.unroute("**/api/listen/welcome-session");
}

async function testResumeServerErrorDoesNotLoadWelcome(page, context) {
  await resetGuestContext(context, page);
  await page.setViewportSize({ width: 1440, height: 900 });

  let welcomeCalls = 0;
  await page.route("**/api/listen/resume-session", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "error" }),
    });
  });
  await page.route("**/api/listen/welcome-session", async (route) => {
    welcomeCalls += 1;
    await route.continue();
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(3000);

  const metrics = await collectMetrics(page);
  assert(welcomeCalls === 0, "resume 500 must not trigger welcome");
  assert(metrics.emptyBarText, "resume 500 shows empty fallback");

  await page.unroute("**/api/listen/resume-session");
  await page.unroute("**/api/listen/welcome-session");
}

async function testUnexpected401DoesNotLoadWelcome(page, context) {
  await resetGuestContext(context, page);
  await page.setViewportSize({ width: 1440, height: 900 });

  let welcomeCalls = 0;
  await page.route("**/api/listen/resume-session", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "unauthorized" }),
    });
  });
  await page.route("**/api/listen/welcome-session", async (route) => {
    welcomeCalls += 1;
    await route.continue();
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(3000);

  const metrics = await collectMetrics(page);
  assert(welcomeCalls === 0, "unexpected 401 must not trigger welcome");
  assert(metrics.emptyBarText, "unexpected 401 shows empty fallback");

  await page.unroute("**/api/listen/resume-session");
  await page.unroute("**/api/listen/welcome-session");
}

async function testMobileWelcomeMiniPlayer(page, context) {
  await resetGuestContext(context, page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(3000);

  const beforePlay = await collectMetrics(page);
  assert(!beforePlay.miniPlayerVisible, "mobile: mini-player hidden before first play");
  assert(beforePlay.audioPaused === true, "mobile: no autoplay");
  assert(beforePlay.audioCount === 1, "mobile: one audio element");

  await page.locator("body").click({ position: { x: 16, y: 16 } });
  await page.evaluate(async () => {
    const audio = document.querySelector("audio");
    if (!audio) {
      throw new Error("audio_missing");
    }
    await audio.play();
  });

  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return audio && !audio.paused;
    },
    { timeout: 15000 },
  );

  await page.waitForTimeout(500);
  const afterPlay = await collectMetrics(page);
  assert(afterPlay.miniPlayerVisible, "mobile: mini-player visible after first play");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const scenarios = [];
  const consoleErrors = [];
  const failedRequests = [];

  async function runIsolatedScenario(name, fn) {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        if (text.includes("401 (Unauthorized)")) {
          return;
        }
        if (text.includes("404 (Not Found)")) {
          return;
        }
        if (text.includes("500 (Internal Server Error)")) {
          return;
        }
        if (text.includes("welcome_session_fetch_failed")) {
          return;
        }
        consoleErrors.push(`${name}: ${text}`);
      }
    });
    page.on("response", (response) => {
      if (
        response.status() >= 500 &&
        !response.url().includes("/api/listen/resume-session")
      ) {
        failedRequests.push(`${name}: ${response.status()} ${response.url()}`);
      }
    });

    try {
      await fn(page, context);
      scenarios.push(name);
    } finally {
      await context.close();
    }
  }

  try {
    await runIsolatedScenario("guest_welcome_desktop", async (page, context) => {
      await resetGuestContext(context, page);
      await testGuestWelcomeDesktop(page);
    });

    await runIsolatedScenario("auth_no_history", testAuthWithoutHistory);
    await runIsolatedScenario("auth_with_history", testAuthWithHistory);
    await runIsolatedScenario("explicit_listen_path", testExplicitListenPath);
    await runIsolatedScenario("explicit_catalog_flow", testExplicitCatalogFlow);
    await runIsolatedScenario("explicit_promo_link", testPromoPracticeLink);
    await runIsolatedScenario("welcome_api_fallback", testWelcomeApiFallback);
    await runIsolatedScenario(
      "resume_server_error_no_welcome",
      testResumeServerErrorDoesNotLoadWelcome,
    );
    await runIsolatedScenario(
      "unexpected_401_no_welcome",
      testUnexpected401DoesNotLoadWelcome,
    );
    await runIsolatedScenario(
      "mobile_mini_player_after_play",
      testMobileWelcomeMiniPlayer,
    );

    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join("; ")}`);
    assert(failedRequests.length === 0, `unexpected 500 responses: ${failedRequests.join("; ")}`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          scenarios,
          consoleErrors,
          failedRequests,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
