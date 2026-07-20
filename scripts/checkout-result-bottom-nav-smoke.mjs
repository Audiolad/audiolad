#!/usr/bin/env node
/**
 * Checkout result BottomNav visual smoke.
 * Usage: AUDIT_BASE_URL=http://127.0.0.1:3017 node scripts/checkout-result-bottom-nav-smoke.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3017";
const CHECKOUT_PATH = "/checkout/result?order_id=00000000-0000-4000-8000-000000000001";

const MOBILE_VIEWPORTS = [
  { width: 320, height: 568, label: "320" },
  { width: 375, height: 812, label: "375" },
  { width: 390, height: 844, label: "390" },
];

async function inspectPage(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".bottom-nav");
    const navStyle = nav ? window.getComputedStyle(nav) : null;
    const shell = document.querySelector(".checkout-result-shell.platform-mobile-shell");
    const shellStyle = shell ? window.getComputedStyle(shell) : null;
    const footer = document.querySelector("footer, [class*='LegalFooter'], a[href='mailto:1@audiolad.ru']");
    const footerRect = footer?.getBoundingClientRect() ?? null;
    const navRect = nav?.getBoundingClientRect() ?? null;
    const docWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;

    return {
      navVisible: Boolean(nav && navStyle?.display !== "none"),
      shellPaddingBottom: shellStyle?.paddingBottom ?? null,
      footerBottom: footerRect?.bottom ?? null,
      navTop: navRect?.top ?? null,
      viewportHeight: window.innerHeight,
      horizontalOverflow: docWidth > viewportWidth + 1,
      activeTabs: Array.from(document.querySelectorAll(".bottom-nav a[aria-current='page']")).length,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of MOBILE_VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}${CHECKOUT_PATH}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const metrics = await inspectPage(page);
    results.push({
      viewport: viewport.label,
      ...metrics,
      ok:
        metrics.navVisible &&
        !metrics.horizontalOverflow &&
        metrics.activeTabs === 0 &&
        metrics.shellPaddingBottom !== "0px",
    });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    const scrolled = await inspectPage(page);
    results.push({
      viewport: `${viewport.label}-scrolled`,
      footerNotOverlapped:
        scrolled.footerBottom !== null &&
        scrolled.navTop !== null &&
        scrolled.footerBottom <= scrolled.navTop + 1,
      ok:
        scrolled.navVisible &&
        scrolled.footerBottom !== null &&
        scrolled.navTop !== null &&
        scrolled.footerBottom <= scrolled.navTop + 1,
    });

    await context.close();
  }

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(`${BASE_URL}${CHECKOUT_PATH}`, { waitUntil: "networkidle" });
  const desktopMetrics = await inspectPage(desktopPage);
  results.push({
    viewport: "desktop-1440",
    ...desktopMetrics,
    ok: !desktopMetrics.navVisible,
  });
  await desktopContext.close();
  await browser.close();

  const failed = results.filter((item) => item.ok === false);
  console.log(JSON.stringify({ base: BASE_URL, results }, null, 2));

  if (failed.length > 0) {
    throw new Error(`checkout-result-bottom-nav-smoke failed: ${failed.length} checks`);
  }

  console.log("checkout-result-bottom-nav-smoke: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
