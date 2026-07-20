#!/usr/bin/env node
import "./lib/assert-playwright-allowed.mjs";
/**
 * Visual smoke for profile/author shell integration.
 * Usage: AUDIOLAD_ALLOW_PLAYWRIGHT=1 node scripts/listener-shell-visual-check.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const OUT_DIR = join("scripts/screenshots/listener-shell-visual");

const VIEWPORTS = [
  { width: 1440, height: 900, label: "desktop-1440" },
  { width: 1280, height: 800, label: "desktop-1280" },
  { width: 1024, height: 768, label: "desktop-1024" },
  { width: 390, height: 844, label: "mobile-390" },
];

const ROUTES = [
  { path: "/profile", label: "profile" },
  { path: "/author-dashboard", label: "author-dashboard" },
];

async function inspectPage(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".listener-app-shell");
    const sidebars = document.querySelectorAll(
      'aside[aria-label="Моё пространство"]',
    );
    const rightColumn = document.querySelector('[aria-label="Панель пользователя и воспроизведения"]');
    const bottomNavs = document.querySelectorAll(".bottom-nav");
    const visibleBottomNavs = Array.from(bottomNavs).filter(
      (node) => window.getComputedStyle(node).display !== "none",
    );
    const desktopPlayer = document.querySelector(".desktop-player-bar");
    const exitButton = Array.from(document.querySelectorAll("a")).find((node) =>
      node.textContent?.includes("В АудиоЛад") ||
      node.textContent?.includes("Вернуться в АудиоЛад"),
    );
    const profileActive = document.querySelector(
      'aside[aria-label="Моё пространство"] a[aria-current="page"][href="/profile"]',
    );

    return {
      hasShell: Boolean(shell),
      sidebarCount: sidebars.length,
      rightColumnVisible: Boolean(
        rightColumn && window.getComputedStyle(rightColumn).display !== "none",
      ),
      visibleBottomNavCount: visibleBottomNavs.length,
      desktopPlayerVisible: Boolean(
        desktopPlayer &&
          window.getComputedStyle(desktopPlayer).display !== "none",
      ),
      hasExitButton: Boolean(exitButton),
      profileActive: Boolean(profileActive),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

async function signIn(page) {
  const email = process.env.AUDIOLAD_SMOKE_EMAIL;
  const password = process.env.AUDIOLAD_SMOKE_PASSWORD;
  if (!email || !password) {
    return false;
  }

  await page.goto(`${BASE}/auth/sign-in`, { waitUntil: "load" });
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Введите пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/(profile|my-practices|$|\?)/, { timeout: 30_000 });
  return true;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const authContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const authPage = await authContext.newPage();
    const signedIn = await signIn(authPage);
    await authContext.close();

    if (!signedIn) {
      console.warn(
        "listener-shell-visual-check: skipped browser assertions (set AUDIOLAD_SMOKE_EMAIL/PASSWORD)",
      );
      return;
    }

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      await signIn(page);

      for (const route of ROUTES) {
        await page.goto(`${BASE}${route.path}`, {
          waitUntil: "networkidle",
        });
        await page.waitForTimeout(1200);

        const metrics = await inspectPage(page);
        const isDesktop = viewport.width >= 1280;
        const isMobile = viewport.width < 1280;
        const isProfile = route.label === "profile";
        const isAuthor = route.label === "author-dashboard";

        if (!metrics.hasShell) {
          throw new Error(`${viewport.label} ${route.label}: missing listener shell`);
        }

        if (metrics.horizontalScroll) {
          throw new Error(`${viewport.label} ${route.label}: horizontal scroll detected`);
        }

        if (isDesktop) {
          if (metrics.sidebarCount === 0) {
            throw new Error(`${viewport.label} ${route.label}: desktop sidebar missing`);
          }
          if (metrics.rightColumnVisible) {
            throw new Error(`${viewport.label} ${route.label}: right column must be hidden`);
          }
          if (!metrics.desktopPlayerVisible) {
            throw new Error(`${viewport.label} ${route.label}: desktop player bar missing`);
          }
        }

        if (isMobile) {
          if (metrics.sidebarCount > 0) {
            const sidebarVisible = await page
              .locator('aside[aria-label="Моё пространство"]')
              .first()
              .isVisible()
              .catch(() => false);
            if (sidebarVisible) {
              throw new Error(`${viewport.label} ${route.label}: desktop sidebar visible on mobile`);
            }
          }
        }

        if (isProfile && isMobile && metrics.visibleBottomNavCount !== 1) {
          throw new Error(
            `${viewport.label} profile: expected one visible bottom nav, got ${metrics.visibleBottomNavCount}`,
          );
        }

        if (isAuthor && metrics.visibleBottomNavCount > 0) {
          throw new Error(`${viewport.label} author-dashboard: bottom nav must stay hidden`);
        }

        if (isAuthor && !metrics.hasExitButton) {
          throw new Error(`${viewport.label} author-dashboard: exit button missing`);
        }

        if (isProfile && isDesktop && !metrics.profileActive) {
          throw new Error(`${viewport.label} profile: sidebar profile item not active`);
        }

        await page.screenshot({
          path: join(OUT_DIR, `${viewport.label}-${route.label}.png`),
          fullPage: false,
        });
      }

      await context.close();
    }

    console.log("listener-shell-visual-check: ok");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
