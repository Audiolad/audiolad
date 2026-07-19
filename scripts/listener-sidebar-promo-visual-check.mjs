#!/usr/bin/env node
/**
 * Desktop sidebar author promo — guest vs active author visual regression.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3015";
const OUT_DIR = path.resolve("scripts/screenshots/listener-sidebar-banner");
const VIEWPORT = { width: 1440, height: 900 };

function sidebarPromoLink(page) {
  return page.locator(
    'aside[aria-label="Моё пространство"] a[href*="/become-author"], aside[aria-label="Моё пространство"] a[href*="/author-dashboard"]',
  );
}

async function signIn(page) {
  const email = process.env.AUDIOLAD_SMOKE_EMAIL;
  const password = process.env.AUDIOLAD_SMOKE_PASSWORD;
  if (!email || !password) {
    return false;
  }

  await page.goto(`${BASE_URL}/auth/sign-in`, { waitUntil: "load" });
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Введите пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/(profile|my-practices|$|\?)/, { timeout: 30_000 });
  return true;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = { baseUrl: BASE_URL, checks: [] };

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
    await page.locator('aside[aria-label="Моё пространство"]').waitFor({
      state: "visible",
      timeout: 60_000,
    });

    const promo = sidebarPromoLink(page);
    const visible = await promo.isVisible();
    const href = visible ? await promo.getAttribute("href") : null;
    const imgSrc = visible
      ? await promo.locator("img").getAttribute("src")
      : null;

    results.checks.push({
      scenario: "guest",
      promoVisible: visible,
      href,
      imgSrc,
    });

    if (!visible || !imgSrc?.includes("become-author-banner")) {
      throw new Error("guest sidebar promo must show become-author banner");
    }

    await page.screenshot({
      path: path.join(OUT_DIR, "guest-not-author-1440x900.png"),
      fullPage: false,
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const signedIn = await signIn(page);

    if (!signedIn) {
      results.checks.push({
        scenario: "active_author",
        skipped: true,
        reason: "AUDIOLAD_SMOKE_EMAIL / AUDIOLAD_SMOKE_PASSWORD not set",
      });
    } else {
      await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
      await page.locator('aside[aria-label="Моё пространство"]').waitFor({
        state: "visible",
        timeout: 60_000,
      });

      const promo = sidebarPromoLink(page);
      const visible = await promo.isVisible();
      const rightColumnAuthorCta = page.getByRole("link", {
        name: "Кабинет автора",
      });
      const authorCtaVisible = await rightColumnAuthorCta.isVisible().catch(() => false);

      results.checks.push({
        scenario: "authenticated",
        promoVisible: visible,
        rightColumnAuthorCtaVisible: authorCtaVisible,
      });

      if (authorCtaVisible && visible) {
        throw new Error("active author must not see sidebar promo when right-column author CTA is visible");
      }

      await page.screenshot({
        path: path.join(
          OUT_DIR,
          authorCtaVisible
            ? "author-dashboard-1440x900.png"
            : "authenticated-listener-1440x900.png",
        ),
        fullPage: false,
      });
    }

    await context.close();
  }

  await browser.close();
  await writeFile(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
  console.log("listener-sidebar-promo-visual-check: ok");
  console.log(JSON.stringify(results, null, 2));
}

run().catch((error) => {
  console.error("listener-sidebar-promo-visual-check: fail", error);
  process.exit(1);
});
