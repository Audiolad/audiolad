#!/usr/bin/env node
/**
 * Platform unified search visual/interactive smoke.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = path.resolve("scripts/screenshots/platform-search");
const SUGGEST_DEBOUNCE_MS = 275;

const desktopViewports = [{ name: "1440x900", width: 1440, height: 900 }];
const mobileViewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

const routes = [
  { path: "/", label: "home" },
  { path: "/catalog", label: "catalog" },
  { path: "/authors/sergey-petrov", label: "author-profile" },
];

const suggestQueries = [
  { name: "izobiliye", query: "изобилие", expectProducts: true },
  { name: "money", query: "деньги", expectProducts: true },
  { name: "title-part", query: "практик", expectProducts: true },
  { name: "author-name", query: "серг", expectProducts: true },
  { name: "empty-result", query: "zzzznotfound999", expectProducts: false },
];

function searchInput(page) {
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

async function assertSingleSearchForm(page, contextLabel) {
  await page.waitForFunction(
    () => document.querySelectorAll('form[role="search"]').length === 1,
    undefined,
    { timeout: 10_000 },
  );

  const searchForms = await page.locator('form[role="search"]').count();
  if (searchForms !== 1) {
    throw new Error(`${contextLabel}: expected 1 search form, got ${searchForms}`);
  }
}

async function runSuggestQueryChecks(page, results) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  const input = searchInput(page);
  await input.waitFor({ state: "visible", timeout: 60_000 });
  await assertSingleSearchForm(page, "home suggest");

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

  await input.fill("деньги");
  await waitForSuggestDebounce(page);
  await platformDropdown(page).waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("ArrowDown");
  const activeDescendant = await input.getAttribute("aria-activedescendant");
  if (!activeDescendant) {
    throw new Error("keyboard: aria-activedescendant missing after ArrowDown");
  }
  results.push({ check: "suggest_keyboard_navigation", ok: true });

  await input.fill("изобилие");
  await waitForSuggestDebounce(page);
  const showAllLink = page.getByRole("link", {
    name: /Показать все результаты по запросу «изобилие»/,
  });
  await showAllLink.waitFor({ state: "visible", timeout: 10_000 });
  const showAllHref = await showAllLink.getAttribute("href");
  if (!showAllHref?.includes("/catalog?q=")) {
    throw new Error(`show-all href invalid: ${showAllHref ?? "null"}`);
  }
  results.push({ check: "suggest_show_all_link", href: showAllHref, ok: true });
}

async function runCatalogGroupedResultsCheck(page, results) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/catalog?q=сергей`, { waitUntil: "load" });
  const input = catalogSearchInput(page);
  await input.waitFor({ state: "visible", timeout: 60_000 });
  await assertSingleSearchForm(page, "catalog grouped");

  const authorsHeading = page.locator("#catalog-search-authors-heading");
  if (!(await authorsHeading.isVisible())) {
    throw new Error("catalog grouped results: authors section missing");
  }

  results.push({ check: "catalog_grouped_results", ok: true });
}

async function runViewport(browser, viewport, results) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "load" });

    const input =
      route.path === "/catalog"
        ? catalogSearchInput(page)
        : searchInput(page);

    await input.waitFor({ state: "visible", timeout: 60_000 });
    await assertSingleSearchForm(page, `${viewport.name} ${route.path} initial`);

    if (route.path !== "/catalog") {
      await input.fill("изоб");
      await waitForSuggestDebounce(page);
      await platformDropdown(page)
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => null);
    }

    if (route.path === "/catalog") {
      await input.fill("деньги");
      await page.waitForURL(/\/catalog\?q=/, { timeout: 10_000 });
      await assertSingleSearchForm(page, `${viewport.name} catalog with q`);
      await input.fill("");
      await page.waitForURL((url) => !url.searchParams.get("q"), {
        timeout: 10_000,
      });
      await assertSingleSearchForm(page, `${viewport.name} catalog cleared`);
    }

    const overflow = await assertNoOverflow(page);
    if (overflow.overflow) {
      throw new Error(
        `${viewport.name} ${route.path}: horizontal overflow ${overflow.scrollWidth}/${overflow.clientWidth}`,
      );
    }

    results.push({
      viewport: viewport.name,
      route: route.path,
      overflow: overflow.overflow,
      scrollWidth: overflow.scrollWidth,
      clientWidth: overflow.clientWidth,
    });

    await page.screenshot({
      path: path.join(OUT_DIR, `${viewport.name}-${route.label}.png`),
      fullPage: false,
    });
  }

  await context.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  const desktopPage = await browser.newPage();
  try {
    await runSuggestQueryChecks(desktopPage, results);
    await runCatalogGroupedResultsCheck(desktopPage, results);
  } finally {
    await desktopPage.close();
  }

  for (const viewport of desktopViewports) {
    await runViewport(browser, viewport, results);
  }

  for (const viewport of mobileViewports) {
    await runViewport(browser, viewport, results);
  }

  await browser.close();

  await writeFile(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify({ baseUrl: BASE_URL, results }, null, 2),
  );

  console.log("platform-search-smoke: ok");
}

main().catch((error) => {
  console.error("platform-search-smoke failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
