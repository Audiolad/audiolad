#!/usr/bin/env node
import "./lib/assert-playwright-allowed.mjs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.REVIEW_BASE_URL ?? "http://127.0.0.1:3019";
const OUT = join("scripts/screenshots/listener-shell-production-review");
const LISTEN_PATH =
  process.env.REVIEW_LISTEN_PATH ??
  "/listen/sergey-and-zoya/klyuch-k-izobiliyu?autoplay=1";
const TEST_EMAIL = process.env.REVIEW_SMOKE_EMAIL ?? "1@audiolad.ru";

const VIEWPORTS = [
  { width: 1440, height: 900, label: "desktop-1440" },
  { width: 1280, height: 800, label: "desktop-1280" },
  { width: 1024, height: 768, label: "tablet-1024" },
  { width: 390, height: 844, label: "mobile-390" },
  { width: 320, height: 568, label: "mobile-320" },
];

const ROUTES = [
  { path: "/profile", label: "profile" },
  { path: "/profile/edit", label: "profile-edit" },
  { path: "/author-dashboard", label: "author-dashboard" },
  { path: "/author-dashboard/profile", label: "author-profile" },
  { path: "/author-dashboard/promotion", label: "author-promotion" },
];

function loadEnv() {
  const candidates = [
    join(process.cwd(), ".env.local"),
    "/var/www/audiolad/.env.local",
  ];
  for (const path of candidates) {
    try {
      return Object.fromEntries(
        readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => line && line.includes("=") && !line.startsWith("#"))
          .map((line) => {
            const index = line.indexOf("=");
            return [line.slice(0, index), line.slice(index + 1)];
          }),
      );
    } catch {
      // try next
    }
  }
  throw new Error("env_file_not_found");
}

async function authContext(browser, baseUrl) {
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
    email: TEST_EMAIL,
  });
  if (error || !linkData?.properties?.hashed_token) {
    throw new Error("auth_link_failed");
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (verifyError || !data.session) {
    throw new Error("auth_verify_failed");
  }

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const host = new URL(baseUrl).hostname;
  const cookies = [
    {
      name: `sb-${projectRef}-auth-token`,
      value: JSON.stringify(data.session),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: baseUrl.startsWith("https"),
      sameSite: "Lax",
    },
  ];

  const context = await browser.newContext();
  await context.addCookies(cookies);
  return context;
}

async function inspect(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".listener-app-shell");
    const sidebar = document.querySelector('aside[aria-label="Моё пространство"]');
    const sidebarVisible =
      sidebar && window.getComputedStyle(sidebar).display !== "none";
    const rightColumn = document.querySelector(
      '[aria-label="Панель пользователя и воспроизведения"]',
    );
    const rightVisible =
      rightColumn && window.getComputedStyle(rightColumn).display !== "none";
    const bottomNavs = Array.from(document.querySelectorAll(".bottom-nav")).filter(
      (node) => window.getComputedStyle(node).display !== "none",
    );
    const desktopPlayer = document.querySelector(".desktop-player-bar");
    const desktopPlayerVisible =
      desktopPlayer && window.getComputedStyle(desktopPlayer).display !== "none";
    const profileActive = document.querySelector(
      'aside[aria-label="Моё пространство"] a[href="/profile"][aria-current="page"]',
    );
    const exitBtn = Array.from(document.querySelectorAll("a")).find((node) =>
      /В АудиоЛад|Вернуться в АудиоЛад/.test(node.textContent ?? ""),
    );
    return {
      hasShell: Boolean(shell),
      sidebarVisible,
      rightVisible,
      bottomNavCount: bottomNavs.length,
      desktopPlayerVisible,
      profileActive: Boolean(profileActive),
      hasExitButton: Boolean(exitBtn),
      horizontalScroll:
        document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

async function readAudio(page) {
  return page.evaluate(() => {
    const audio = document.querySelector("audio");
    return {
      paused: audio?.paused ?? true,
      currentTime: audio?.currentTime ?? 0,
      src: audio?.currentSrc || audio?.src || "",
    };
  });
}

async function waitForAudio(page, timeoutMs = 25000) {
  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return Boolean(audio && !audio.paused && audio.currentTime > 0.05);
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const results = [];
  const browser = await chromium.launch({ headless: true });
  const context = await authContext(browser, BASE);
  const page = await context.newPage();

  // discover product editor route
  await page.goto(`${BASE}/author-dashboard`, { waitUntil: "networkidle" });
  const editHref = await page
    .locator('a:has-text("Редактировать")')
    .first()
    .getAttribute("href")
    .catch(() => null);
  const allRoutes = [...ROUTES];
  if (editHref) {
    allRoutes.push({
      path: editHref,
      label: "author-product-edit",
    });
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    for (const route of allRoutes) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const metrics = await inspect(page);
      const isDesktop = viewport.width >= 1280;
      const isMobile = viewport.width < 1280;
      const isProfile = route.path.startsWith("/profile");
      const isAuthor = route.path.startsWith("/author-dashboard");

      const checks = [];
      if (!metrics.hasShell) checks.push("missing shell");
      if (metrics.horizontalScroll) checks.push("horizontal scroll");
      if (isDesktop) {
        if (!metrics.sidebarVisible) checks.push("sidebar missing");
        if (metrics.rightVisible) checks.push("right column visible");
        if (!metrics.desktopPlayerVisible) checks.push("desktop player missing");
      } else if (isDesktop === false && viewport.width >= 1024) {
        if (metrics.sidebarVisible) checks.push("sidebar visible below xl");
      }
      if (isProfile && isMobile && metrics.bottomNavCount !== 1) {
        checks.push(`profile bottom nav=${metrics.bottomNavCount}`);
      }
      if (isAuthor && metrics.bottomNavCount > 0) {
        checks.push("author bottom nav visible");
      }
      if (isAuthor && !metrics.hasExitButton) checks.push("exit button missing");
      if (
        isProfile &&
        isDesktop &&
        (route.path === "/profile" || route.path === "/profile/edit") &&
        !metrics.profileActive
      ) {
        checks.push("profile sidebar inactive");
      }

      await page.screenshot({
        path: join(OUT, `${viewport.label}-${route.label}.png`),
        fullPage: false,
      });

      results.push({
        viewport: viewport.label,
        route: route.label,
        metrics,
        ok: checks.length === 0,
        checks,
      });
    }
  }

  // functional navigation
  const navResults = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/catalog`, { waitUntil: "networkidle" });
  await page.locator('aside[aria-label="Моё пространство"] a[href="/profile"]').click();
  await page.waitForURL(/\/profile/, { timeout: 15000 });
  navResults.push({ step: "sidebar-profile", ok: page.url().includes("/profile") });

  await page.getByRole("link", { name: /Кабинет автора|author/i }).first().click().catch(async () => {
    await page.goto(`${BASE}/author-dashboard`);
  });
  await page.waitForURL(/\/author-dashboard/, { timeout: 15000 });
  navResults.push({ step: "profile-to-author", ok: true });

  await page.getByRole("link", { name: /Вернуться в АудиоЛад|В АудиоЛад/ }).click();
  await page.waitForURL(/\/profile/, { timeout: 15000 });
  navResults.push({ step: "author-exit-profile", ok: true });

  await page.locator('aside[aria-label="Моё пространство"] a[href="/"]').first().click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
  navResults.push({ step: "logo-home", ok: true });

  // player persistence desktop
  await page.goto(`${BASE}${LISTEN_PATH}`, { waitUntil: "networkidle" });
  const play = page.getByRole("button", { name: /Воспроизвести|Play/i });
  if (await play.isVisible().catch(() => false)) await play.click();
  await waitForAudio(page);
  const before = await readAudio(page);
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const onProfile = await readAudio(page);
  const playerBar = await page.locator(".desktop-player-bar").isVisible();
  const playerOk =
    !onProfile.paused &&
    onProfile.currentTime + 0.5 >= before.currentTime &&
    playerBar;

  await page.goto(`${BASE}/author-dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const onAuthor = await readAudio(page);

  await page.getByRole("link", { name: /Вернуться в АудиоЛад|В АудиоЛад/ }).click();
  await page.waitForURL(/\/profile/, { timeout: 15000 });
  const backProfile = await readAudio(page);

  const playerResults = {
    before,
    onProfile,
    onAuthor,
    backProfile,
    playerBarOnProfile: playerBar,
    ok:
      playerOk &&
      !onAuthor.paused &&
      !backProfile.paused &&
      backProfile.currentTime + 0.5 >= before.currentTime,
  };

  // mobile mini-player on profile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}${LISTEN_PATH}`, { waitUntil: "networkidle" });
  if (await play.isVisible().catch(() => false)) await play.click();
  await waitForAudio(page);
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const miniVisible = await page.locator(".global-mini-player").isVisible();
  const mobileAudio = await readAudio(page);

  await page.goto(`${BASE}/author-dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const authorMini = await page.locator(".global-mini-player").isVisible();
  const authorMobileAudio = await readAudio(page);

  const report = {
    base: BASE,
    listenPath: LISTEN_PATH,
    visual: results,
    navigation: navResults,
    playerDesktop: playerResults,
    playerMobile: {
      miniVisibleOnProfile: miniVisible,
      profileAudioPlaying: !mobileAudio.paused,
      miniVisibleOnAuthorProfile: authorMini,
      authorAudioPlaying: !authorMobileAudio.paused,
    },
    failedVisual: results.filter((item) => !item.ok),
    failedNav: navResults.filter((item) => !item.ok),
  };

  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();

  if (
    report.failedVisual.length > 0 ||
    report.failedNav.length > 0 ||
    !report.playerDesktop.ok
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
