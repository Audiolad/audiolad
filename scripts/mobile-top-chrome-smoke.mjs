#!/usr/bin/env node
/**
 * Phase 1 mobile chrome geometry smoke across Catalog / Playlists / Audiotheque.
 * Skips cleanly when AUDIT_BASE_URL is unreachable (unit tests remain the gate).
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";

async function isServerUp() {
  try {
    const response = await fetch(BASE_URL, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function chromeGeometry(page) {
  return page.evaluate(() => {
    const chromes = [...document.querySelectorAll("[data-mobile-top-chrome]")];
    const spacers = [...document.querySelectorAll("[data-mobile-top-chrome-spacer]")];
    const navs = [...document.querySelectorAll(".bottom-nav")];
    const chrome = chromes[0];
    const spacer = spacers[0];
    const nav = navs[0];
    const chromeRect = chrome?.getBoundingClientRect();
    const spacerRect = spacer?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const searchInput = document.querySelector(
      '[data-mobile-top-chrome] input[type="search"]',
    );

    return {
      chromeCount: chromes.length,
      spacerCount: spacers.length,
      navCount: navs.length,
      chromePosition: chrome ? getComputedStyle(chrome).position : null,
      chromeTop: chromeRect?.top ?? null,
      chromeHeight: chromeRect?.height ?? null,
      spacerHeight: spacerRect?.height ?? null,
      navParentIsBody: nav?.parentElement === document.body,
      navPosition: nav ? getComputedStyle(nav).position : null,
      navBottom: navRect ? window.innerHeight - navRect.bottom : null,
      navTransform: nav ? getComputedStyle(nav).transform : null,
      searchFontSize: searchInput
        ? Number.parseFloat(getComputedStyle(searchInput).fontSize)
        : null,
    };
  });
}

function assertGeometry(metrics, label) {
  if (metrics.chromeCount !== 1) {
    throw new Error(`${label}: expected 1 top chrome, got ${metrics.chromeCount}`);
  }
  if (metrics.spacerCount !== 1) {
    throw new Error(`${label}: expected 1 spacer, got ${metrics.spacerCount}`);
  }
  if (metrics.navCount !== 1) {
    throw new Error(`${label}: expected 1 BottomNav, got ${metrics.navCount}`);
  }
  if (metrics.chromePosition !== "fixed" || Math.abs(metrics.chromeTop ?? 99) > 1) {
    throw new Error(`${label}: top chrome is not fixed at top≈0`);
  }
  if (Math.abs((metrics.spacerHeight ?? 0) - (metrics.chromeHeight ?? 0)) > 1) {
    throw new Error(
      `${label}: spacer ${metrics.spacerHeight} !== chrome ${metrics.chromeHeight}`,
    );
  }
  if (
    metrics.navPosition !== "fixed" ||
    metrics.navParentIsBody !== true ||
    metrics.navTransform !== "none" ||
    Math.abs(metrics.navBottom ?? 99) > 1
  ) {
    throw new Error(`${label}: BottomNav is not viewport-pinned to body`);
  }
  if (metrics.searchFontSize != null && metrics.searchFontSize < 16) {
    throw new Error(`${label}: search font-size ${metrics.searchFontSize} < 16`);
  }
}

async function typeAndWait(page, input, query, timeoutMs) {
  await input.fill("");
  await input.fill(query);
  await page.waitForURL((url) => url.searchParams.get("q") === query, {
    timeout: timeoutMs,
  });
}

async function clearAndWait(page, input, timeoutMs) {
  await input.fill("");
  await page.waitForFunction(
    () => !new URL(window.location.href).searchParams.get("q"),
    undefined,
    { timeout: timeoutMs },
  );
}

async function runSurface(page, {
  path,
  inputName,
  query,
  label,
}) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
  const input = page.getByRole("searchbox", { name: inputName }).or(
    page.getByRole("combobox", { name: inputName }),
  );
  await input.waitFor({ state: "visible", timeout: 60_000 });
  assertGeometry(await chromeGeometry(page), `${label} idle`);

  await typeAndWait(page, input, query, 10_000);
  assertGeometry(await chromeGeometry(page), `${label} search`);

  await clearAndWait(page, input, 10_000);
  assertGeometry(await chromeGeometry(page), `${label} clear`);

  await typeAndWait(page, input, query, 10_000);
  await page.goBack();
  await page.waitForTimeout(200);
  assertGeometry(await chromeGeometry(page), `${label} back`);
  await page.goForward();
  await page.waitForTimeout(200);
  assertGeometry(await chromeGeometry(page), `${label} forward`);
}

async function maybeOpenFilter(page, buttonName) {
  const button = page.getByRole("button", { name: buttonName }).first();
  if (!(await button.isVisible().catch(() => false))) {
    return false;
  }
  await button.click();
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  return true;
}

async function main() {
  if (!(await isServerUp())) {
    console.log("mobile-top-chrome-smoke: skipped (server not reachable)");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  await runSurface(page, {
    path: "/catalog",
    inputName: "Поиск аудиопродуктов в каталоге",
    query: "прогноз",
    label: "catalog",
  });
  await maybeOpenFilter(page, "Фильтры");
  assertGeometry(await chromeGeometry(page), "catalog after filter");

  await runSurface(page, {
    path: "/playlists/catalog",
    inputName: "Поиск плейлистов",
    query: "деньги",
    label: "playlists",
  });

  await page.goto(`${BASE_URL}/my-practices`, { waitUntil: "load" });
  if (page.url().includes("/my-practices")) {
    const libraryInput = page.getByRole("searchbox", { name: "Поиск по аудиотеке" });
    if (await libraryInput.isVisible().catch(() => false)) {
      await runSurface(page, {
        path: "/my-practices",
        inputName: "Поиск по аудиотеке",
        query: "практик",
        label: "library",
      });
      await maybeOpenFilter(page, "Фильтры");
      assertGeometry(await chromeGeometry(page), "library after filter");
    }
  }

  await browser.close();
  console.log("mobile-top-chrome-smoke: ok");
}

main().catch((error) => {
  console.error(
    "mobile-top-chrome-smoke failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
