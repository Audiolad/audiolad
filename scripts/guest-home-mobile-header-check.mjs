#!/usr/bin/env node
/**
 * Verify guest home mobile header fits at narrow viewports.
 * Usage: AUDIT_BASE_URL=http://127.0.0.1:3015 node scripts/guest-home-mobile-header-check.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";

const viewports = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function measure(page, width) {
  await page.setViewportSize({ width, height: 640 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });

  return page.evaluate((viewportWidth) => {
    const header = document.querySelector("header");
    const logoLink = header?.querySelector('a[href="/"]');
    const signUp = [...(header?.querySelectorAll("a") ?? [])].find((a) =>
      a.textContent?.includes("Регистрация"),
    );
    const hero = document.querySelector(".listener-home-content h1");

    const docWidth = document.documentElement.scrollWidth;
    const bodyOverflow = docWidth > viewportWidth;

    const headerRect = header?.getBoundingClientRect();
    const logoRect = logoLink?.getBoundingClientRect();
    const signUpRect = signUp?.getBoundingClientRect();
    const heroRect = hero?.getBoundingClientRect();

    const headerStyle = header ? getComputedStyle(header) : null;

    return {
      viewportWidth,
      horizontalScroll: bodyOverflow,
      scrollWidth: docWidth,
      headerPaddingLeft: headerStyle?.paddingLeft ?? null,
      headerPaddingRight: headerStyle?.paddingRight ?? null,
      logoLeft: logoRect?.left ?? null,
      logoWidth: logoRect?.width ?? null,
      heroLeft: heroRect?.left ?? null,
      logoAlignDelta: logoRect && heroRect ? Math.abs(logoRect.left - heroRect.left) : null,
      signUpRight: signUpRect ? signUpRect.right : null,
      signUpVisible:
        signUpRect != null &&
        signUpRect.right <= viewportWidth &&
        signUpRect.left >= 0,
      signUpClipped:
        signUpRect != null && signUpRect.right > viewportWidth - 0.5,
      rightGutter:
        signUpRect != null ? viewportWidth - signUpRect.right : null,
      heroRightGutter:
        heroRect != null ? viewportWidth - heroRect.right : null,
    };
  }, width);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = [];
  let failed = false;

  for (const { width } of viewports) {
    const result = await measure(page, width);
    results.push(result);

    const ok =
      !result.horizontalScroll &&
      result.signUpVisible &&
      !result.signUpClipped &&
      (result.logoAlignDelta ?? 99) <= 1;

    if (!ok) failed = true;
  }

  await browser.close();

  console.log(JSON.stringify({ baseUrl: BASE_URL, results, passed: !failed }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
