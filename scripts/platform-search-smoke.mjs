#!/usr/bin/env node
/**
 * Platform unified search visual/interactive smoke (responsive desktop + mobile).
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = path.resolve("scripts/screenshots/platform-search");
const SUGGEST_DEBOUNCE_MS = 275;
const CATALOG_DEBOUNCE_MS = 350;

const desktopViewport = { name: "1440x900", width: 1440, height: 900 };
const mobileViewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

const suggestQueries = [
  { name: "izobiliye", query: "изобилие", expectProducts: true },
  { name: "money", query: "деньги", expectProducts: true },
  { name: "title-part", query: "практик", expectProducts: true },
  { name: "author-name", query: "серг", expectProducts: true },
  { name: "empty-result", query: "zzzznotfound999", expectProducts: false },
];

function suggestSearchInput(page) {
  return page.getByRole("combobox", { name: "Поиск аудиопродуктов" });
}

function catalogSearchInput(page) {
  return page.getByRole("combobox", { name: "Поиск аудиопродуктов в каталоге" });
}

function platformDropdown(page) {
  return page.locator(
    '[role="listbox"][aria-label="Быстрые результаты поиска аудиопродуктов"]',
  );
}

async function countDomSearchForms(page) {
  return page.evaluate(
    () => document.querySelectorAll('form[role="search"]').length,
  );
}

async function assertDomSearchFormCount(page, expected, contextLabel) {
  await page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('form[role="search"]').length === expectedCount,
    expected,
    { timeout: 15_000 },
  );
  const count = await countDomSearchForms(page);
  if (count !== expected) {
    throw new Error(
      `${contextLabel}: expected ${expected} DOM search forms, got ${count}`,
    );
  }
}

async function countVisibleSearchForms(page) {
  return page.locator('form[role="search"]:visible').count();
}

async function assertVisibleSearchFormCount(page, expected, contextLabel) {
  const count = await countVisibleSearchForms(page);
  if (count !== expected) {
    throw new Error(`${contextLabel}: expected ${expected} visible search forms, got ${count}`);
  }
}

async function assertNoOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflow: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
}

async function waitForSuggestDebounce(page) {
  await page.waitForTimeout(SUGGEST_DEBOUNCE_MS + 100);
}

async function waitForCatalogDebounce(page) {
  await page.waitForTimeout(CATALOG_DEBOUNCE_MS + 100);
}

async function assertCatalogSearchBelowHeading(page, contextLabel) {
  const ok = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h1")].find((el) => {
      if (!/каталог/i.test(el.textContent ?? "")) {
        return false;
      }

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.height > 0 &&
        rect.width > 0
      );
    });
    const form = [...document.querySelectorAll('form[role="search"]')].find((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.height > 0 &&
        rect.width > 0
      );
    });
    if (!heading || !form) {
      return false;
    }

    const headingRect = heading.getBoundingClientRect();
    const formRect = form.getBoundingClientRect();
    return formRect.top >= headingRect.bottom - 2;
  });

  if (!ok) {
    throw new Error(`${contextLabel}: catalog search is not below the «Каталог» heading`);
  }
}

async function runSuggestQueryChecks(page, results) {
  await page.setViewportSize(desktopViewport);
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  const input = suggestSearchInput(page);
  await input.waitFor({ state: "visible", timeout: 60_000 });
  await assertDomSearchFormCount(page, 1, "desktop home suggest");
  await assertVisibleSearchFormCount(page, 1, "desktop home suggest");

  for (const scenario of suggestQueries) {
    await input.fill("");
    await waitForSuggestDebounce(page);
    await input.fill(scenario.query);
    await waitForSuggestDebounce(page);

    const dropdown = platformDropdown(page);
    await dropdown.waitFor({ state: "visible", timeout: 10_000 });

    const productOptions = page.locator('[id^="catalog-search-product-option-"]');
    const productCount = await productOptions.count();

    if (scenario.expectProducts) {
      if (productCount <= 0 || productCount > 5) {
        throw new Error(
          `${scenario.name}: expected 1-5 products, got ${productCount}`,
        );
      }
    } else if (productCount !== 0 || !(await dropdown.getByText("Ничего не найдено").isVisible())) {
      throw new Error(`${scenario.name}: expected empty suggest state`);
    }

    results.push({
      check: `suggest_${scenario.name}`,
      query: scenario.query,
      productCount,
      ok: true,
    });
  }

  await input.fill("изобилие");
  await waitForSuggestDebounce(page);
  await input.press("Enter");
  await page.waitForURL(/\/catalog\?q=/, { timeout: 10_000 });
  results.push({ check: "desktop_home_enter_to_catalog", url: page.url(), ok: true });
}

async function runDesktopSmoke(page, results) {
  await page.setViewportSize(desktopViewport);

  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await suggestSearchInput(page).waitFor({ state: "visible", timeout: 60_000 });
  await assertDomSearchFormCount(page, 1, "desktop home");
  await assertVisibleSearchFormCount(page, 1, "desktop home");
  await page.screenshot({
    path: path.join(OUT_DIR, "desktop-1440-home.png"),
    fullPage: true,
  });
  results.push({ check: "desktop_home_search_visible", ok: true });

  await page.goto(`${BASE_URL}/catalog`, { waitUntil: "load" });
  await catalogSearchInput(page).waitFor({ state: "visible", timeout: 60_000 });
  await assertDomSearchFormCount(page, 1, "desktop catalog empty");
  await assertVisibleSearchFormCount(page, 1, "desktop catalog empty");
  await page.screenshot({
    path: path.join(OUT_DIR, "desktop-1440-catalog-empty.png"),
    fullPage: true,
  });

  const catalogInput = catalogSearchInput(page);
  await catalogInput.fill("изобилие");
  await waitForCatalogDebounce(page);
  await page.waitForURL(
    (url) => url.searchParams.get("q") === "изобилие",
    { timeout: 10_000 },
  );
  await assertDomSearchFormCount(page, 1, "desktop catalog search active");
  await assertVisibleSearchFormCount(page, 1, "desktop catalog search active");
  await page.screenshot({
    path: path.join(OUT_DIR, "desktop-1440-catalog-izobiliye.png"),
    fullPage: true,
  });

  await catalogInput.fill("");
  await waitForCatalogDebounce(page);
  await page.waitForFunction(
    () => !new URL(window.location.href).searchParams.get("q"),
    undefined,
    { timeout: 10_000 },
  );

  const overflow = await assertNoOverflow(page);
  if (overflow.overflow) {
    throw new Error(`desktop catalog overflow ${overflow.scrollWidth}/${overflow.clientWidth}`);
  }

  results.push({ check: "desktop_catalog_smoke", ok: true });
}

async function runMobileSmoke(browser, viewport, results) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await assertDomSearchFormCount(page, 0, `${viewport.name} home`);
  await assertVisibleSearchFormCount(page, 0, `${viewport.name} home`);
  const homeHeader = page.locator("header").first();
  await homeHeader.waitFor({ state: "visible", timeout: 10_000 });
  if (viewport.name === "390x844") {
    await page.screenshot({
      path: path.join(OUT_DIR, "mobile-390-home.png"),
      fullPage: true,
    });
  }
  results.push({ check: `${viewport.name}_home_no_global_search`, ok: true });

  await page.goto(`${BASE_URL}/catalog`, { waitUntil: "load" });
  await catalogSearchInput(page).waitFor({ state: "visible", timeout: 60_000 });
  await assertDomSearchFormCount(page, 1, `${viewport.name} catalog`);
  await assertVisibleSearchFormCount(page, 1, `${viewport.name} catalog`);
  await assertCatalogSearchBelowHeading(page, viewport.name);

  if (viewport.name === "390x844") {
    await page.screenshot({
      path: path.join(OUT_DIR, "mobile-390-catalog-empty.png"),
      fullPage: true,
    });
  }

  const catalogInput = catalogSearchInput(page);
  await catalogInput.fill("изобилие");
  await waitForCatalogDebounce(page);
  await page.waitForURL(
    (url) => url.searchParams.get("q") === "изобилие",
    { timeout: 10_000 },
  );

  if (viewport.name === "390x844") {
    await page.screenshot({
      path: path.join(OUT_DIR, "mobile-390-catalog-izobiliye.png"),
      fullPage: true,
    });
  }

  await catalogInput.fill("");
  await waitForCatalogDebounce(page);
  await page.waitForFunction(
    () => !new URL(window.location.href).searchParams.get("q"),
    undefined,
    { timeout: 10_000 },
  );

  await page.goto(`${BASE_URL}/my-practices`, { waitUntil: "load" });
  await assertDomSearchFormCount(page, 0, `${viewport.name} library`);
  await assertVisibleSearchFormCount(page, 0, `${viewport.name} library`);
  if (page.url().includes("/my-practices")) {
    await page.getByRole("heading", { name: "Аудиотека" }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
  }
  if (viewport.name === "390x844") {
    await page.screenshot({
      path: path.join(OUT_DIR, "mobile-390-library.png"),
      fullPage: true,
    });
  }

  await page.goto(`${BASE_URL}/playlists`, { waitUntil: "load" }).catch(() => null);
  const onPlaylists = page.url().includes("/playlists");
  if (onPlaylists) {
    await assertDomSearchFormCount(page, 0, `${viewport.name} playlists`);
    await assertVisibleSearchFormCount(page, 0, `${viewport.name} playlists`);
  }

  await page.goto(`${BASE_URL}/profile`, { waitUntil: "load" }).catch(() => null);
  if (page.url().includes("/profile")) {
    await assertDomSearchFormCount(page, 0, `${viewport.name} profile`);
    await assertVisibleSearchFormCount(page, 0, `${viewport.name} profile`);
  }

  const overflow = await assertNoOverflow(page);
  if (overflow.overflow) {
    throw new Error(
      `${viewport.name}: horizontal overflow ${overflow.scrollWidth}/${overflow.clientWidth}`,
    );
  }

  results.push({ check: `${viewport.name}_mobile_smoke`, ok: true });
  await context.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  const desktopPage = await browser.newPage();
  try {
    await runSuggestQueryChecks(desktopPage, results);
    await runDesktopSmoke(desktopPage, results);
  } finally {
    await desktopPage.close();
  }

  for (const viewport of mobileViewports) {
    await runMobileSmoke(browser, viewport, results);
  }

  await browser.close();

  await writeFile(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify({ baseUrl: BASE_URL, results }, null, 2),
  );

  console.log("platform-search-smoke: ok");
}

main().catch((error) => {
  console.error(
    "platform-search-smoke failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
