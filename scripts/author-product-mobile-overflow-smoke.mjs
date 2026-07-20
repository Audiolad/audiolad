#!/usr/bin/env node
import "./lib/assert-playwright-allowed.mjs";
/**
 * Regression smoke: author product editor must not cause horizontal overflow on mobile.
 *
 * Usage:
 *   AUDIOLAD_ALLOW_PLAYWRIGHT=1 node scripts/author-product-mobile-overflow-smoke.mjs [baseUrl]
 *
 * Requires: running app, .env.local with Supabase keys, magic-link smoke user.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const TEST_EMAIL = process.env.REVIEW_SMOKE_EMAIL ?? "1@audiolad.ru";

const VIEWPORTS = [
  { width: 320, height: 568, label: "mobile-320" },
  { width: 360, height: 800, label: "mobile-360" },
  { width: 390, height: 844, label: "mobile-390" },
];

const NEIGHBOR_ROUTES = [
  "/author-dashboard",
  "/author-dashboard/profile",
  "/author-dashboard/promotion",
];

function loadEnv() {
  for (const path of [join(process.cwd(), ".env.local"), "/var/www/audiolad/.env.local"]) {
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
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem("audiolad_analytics_cookies", "granted");
  });
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: JSON.stringify(data.session),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: baseUrl.startsWith("https"),
      sameSite: "Lax",
    },
  ]);
  return context;
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll("*")]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          className: String(el.className || "").slice(0, 80),
          left: rect.left,
          right: rect.right,
        };
      })
      .filter((item) => item.left < -0.5 || item.right > window.innerWidth + 0.5)
      .slice(0, 5);

    return {
      innerWidth: window.innerWidth,
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      offenders,
    };
  });
}

async function assertEditorControls(page) {
  const saveVisible = await page
    .getByRole("button", { name: /Сохранить/i })
    .first()
    .isVisible()
    .catch(() => false);
  const fileInputs = await page.locator('input[type="file"]').count();
  const exitVisible = await page
    .getByRole("link", { name: /В АудиоЛад|Вернуться в АудиоЛад/ })
    .isVisible()
    .catch(() => false);
  const internalBackVisible = await page
    .getByRole("link", { name: /Назад в кабинет/ })
    .isVisible()
    .catch(() => false);
  const bottomNavCount = await page.locator(".bottom-nav").count();
  const visibleBottomNav = await page
    .locator(".bottom-nav")
    .first()
    .isVisible()
    .catch(() => false);

  if (!saveVisible) throw new Error("save button not visible");
  if (fileInputs < 1) throw new Error("file input missing");
  if (!exitVisible) throw new Error("exit button not visible");
  if (!internalBackVisible) throw new Error("internal back not visible");
  if (visibleBottomNav || bottomNavCount > 0) {
    throw new Error("author route must not show BottomNav");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await authContext(browser, BASE);
  const page = await context.newPage();
  const failures = [];

  await page.goto(`${BASE}/author-dashboard`, { waitUntil: "networkidle" });
  const editHref = await page
    .locator('a:has-text("Редактировать")')
    .first()
    .getAttribute("href");
  if (!editHref) {
    throw new Error("product editor link not found");
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(`${BASE}${editHref}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const metrics = await measureOverflow(page);
    if (metrics.scrollWidth > metrics.clientWidth + 1) {
      failures.push({
        route: editHref,
        viewport: viewport.label,
        metrics,
        reason: "document horizontal overflow",
      });
      continue;
    }

    try {
      await assertEditorControls(page);
    } catch (error) {
      failures.push({
        route: editHref,
        viewport: viewport.label,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const route of NEIGHBOR_ROUTES) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const metrics = await measureOverflow(page);
      if (metrics.scrollWidth > metrics.clientWidth + 1) {
        failures.push({
          route,
          viewport: `mobile-${width}`,
          metrics,
          reason: "neighbor route overflow",
        });
      }
    }
  }

  await browser.close();

  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2));
    process.exit(1);
  }

  console.log("author-product-mobile-overflow-smoke: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
