#!/usr/bin/env node
/**
 * BottomNav responsive smoke for desktop hidden / mobile visible.
 * Usage: AUDIT_BASE_URL=http://127.0.0.1:3017 node scripts/bottom-nav-responsive-smoke.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3017";
const OUT_DIR = path.resolve("scripts/screenshots/bottom-nav-responsive-smoke");

const DESKTOP_VIEWPORTS = [
  { width: 1280, height: 800, label: "desktop-1280" },
  { width: 1440, height: 900, label: "desktop-1440" },
  { width: 1920, height: 1080, label: "desktop-1920" },
];

const MOBILE_VIEWPORTS = [
  { width: 320, height: 568, label: "mobile-320" },
  { width: 375, height: 812, label: "mobile-375" },
  { width: 390, height: 844, label: "mobile-390" },
  { width: 430, height: 932, label: "mobile-430" },
];

const PAGES = [
  { path: "/", label: "home" },
  { path: "/catalog", label: "catalog" },
  { path: "/my-practices", label: "my-practices" },
  { path: "/playlists", label: "playlists" },
  { path: "/profile", label: "profile" },
];

async function inspectBottomNav(page) {
  return page.evaluate(() => {
    const navs = Array.from(document.querySelectorAll(".bottom-nav"));
    const styles = navs.map((nav) => window.getComputedStyle(nav));
    const shell = document.querySelector(".listener-app-shell__body.platform-mobile-shell");

    return {
      count: navs.length,
      visibleCount: styles.filter((style) => style.display !== "none").length,
      hiddenCount: styles.filter((style) => style.display === "none").length,
      shellPaddingBottom: shell
        ? window.getComputedStyle(shell).paddingBottom
        : null,
    };
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of DESKTOP_VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();

    for (const route of PAGES) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });
      const metrics = await inspectBottomNav(page);
      const screenshotPath = path.join(
        OUT_DIR,
        `${viewport.label}-${route.label}.png`,
      );

      if (route.label === "my-practices" && viewport.label === "desktop-1440") {
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }

      results.push({
        viewport: viewport.label,
        route: route.label,
        metrics,
        ok: metrics.count <= 1 && metrics.visibleCount === 0,
      });
    }

    await context.close();
  }

  for (const viewport of MOBILE_VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();

    for (const route of PAGES) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });
      const metrics = await inspectBottomNav(page);

      if (route.label === "my-practices" && viewport.label === "mobile-390") {
        await page.screenshot({
          path: path.join(OUT_DIR, "mobile-my-practices-with-bottom-nav.png"),
          fullPage: false,
        });
      }

      results.push({
        viewport: viewport.label,
        route: route.label,
        metrics,
        ok: metrics.count === 1 && metrics.visibleCount === 1,
      });
    }

    await context.close();
  }

  await browser.close();

  await writeFile(
    path.join(OUT_DIR, "report.json"),
    `${JSON.stringify({ baseUrl: BASE_URL, results }, null, 2)}\n`,
  );

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error("bottom-nav-responsive-smoke: failed", failed);
    process.exit(1);
  }

  console.log(`bottom-nav-responsive-smoke: ok (${OUT_DIR})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
