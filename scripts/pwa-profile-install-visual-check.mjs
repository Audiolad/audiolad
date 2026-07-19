#!/usr/bin/env node
import "./lib/assert-playwright-allowed.mjs";
/**
 * Visual smoke: profile PWA install fallback bottom sheet on Android viewport.
 *
 * Usage:
 *   AUDIOLAD_ALLOW_PLAYWRIGHT=1 node scripts/pwa-profile-install-visual-check.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://127.0.0.1:3029";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "screenshots/pwa-profile-install-visual");
const METRICS_PATH = join(OUT_DIR, "metrics.json");

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36";

function loadEnv() {
  const candidates = [
    "/var/www/audiolad/.env.local",
    "/var/www/audiolad-deploy/current/.env.local",
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
      // try next candidate
    }
  }

  throw new Error("env_file_not_found");
}

async function getAuthCookies(baseUrl) {
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
    email: "1@audiolad.ru",
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
  const cookieBase = {
    domain: host,
    path: "/",
    httpOnly: false,
    secure: host !== "localhost" && host !== "127.0.0.1",
    sameSite: "Lax",
  };

  const payload = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: "bearer",
    user: data.session.user,
  });

  return [
    {
      ...cookieBase,
      name: `sb-${projectRef}-auth-token`,
      value: payload,
    },
  ];
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function measureDialog(page) {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((node) =>
      node.getAttribute("aria-labelledby") === "pwa-install-dialog-title",
    );
    const bottomNav = document.querySelector(".bottom-nav");
    const title = document.getElementById("pwa-install-dialog-title");
    const closeButton = dialog?.querySelector('button[aria-label="Закрыть"]');
    const okButton = [...(dialog?.querySelectorAll("button") ?? [])].find((node) =>
      node.textContent?.includes("Понятно"),
    );
    const subtitle = [...document.querySelectorAll("button span")].find((node) =>
      node.textContent?.includes("Добавьте иконку на экран"),
    );

    const rect = (element) => {
      if (!element) {
        return null;
      }

      const box = element.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
      };
    };

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const dialogBox = rect(dialog);
    const navBox = rect(bottomNav);

    return {
      viewport,
      bodyOverflow: document.body.style.overflow,
      dialogVisible: Boolean(dialog),
      titleText: title?.textContent ?? null,
      hasCloseButton: Boolean(closeButton),
      hasOkButton: Boolean(okButton),
      subtitleDisplay: subtitle ? getComputedStyle(subtitle).display : null,
      subtitleText: subtitle?.textContent ?? null,
      dialogBox,
      navBox,
      okButtonBox: rect(okButton),
      closeButtonBox: rect(closeButton),
    };
  });
}

async function dismissAnalyticsConsentIfPresent(page) {
  const consentDialog = page.getByRole("dialog", {
    name: /Аналитические cookies/i,
  });
  const isVisible = await consentDialog.isVisible().catch(() => false);

  if (!isVisible) {
    return;
  }

  const acceptButton = consentDialog.getByRole("button", {
    name: /Разрешить|Отклонить/i,
  });
  if (await acceptButton.count()) {
    await acceptButton.first().click();
    await consentDialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
    return;
  }

  const closeButton = consentDialog.getByRole("button", { name: /Закрыть/i });
  if (await closeButton.count()) {
    await closeButton.first().click();
  }
}

function pwaInstallDialog(page) {
  return page.getByRole("dialog", { name: /Установить АудиоЛад/i });
}

async function runViewportCheck(page, viewport, screenshotName) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await dismissAnalyticsConsentIfPresent(page);

  const installButton = page
    .getByRole("button", { name: /Установить АудиоЛад/i })
    .first();
  await installButton.waitFor({ state: "visible", timeout: 20_000 });
  await installButton.click();

  const dialog = pwaInstallDialog(page);
  await dialog.waitFor({ state: "visible", timeout: 10_000 });

  const metrics = await measureDialog(page);

  assert(metrics.dialogVisible, `${screenshotName}: dialog must be visible`);
  assert(
    metrics.titleText?.includes("Установить АудиоЛад"),
    `${screenshotName}: dialog title must match product copy`,
  );
  assert(metrics.hasCloseButton, `${screenshotName}: close button must exist`);
  assert(metrics.hasOkButton, `${screenshotName}: confirm button must exist`);
  assert(
    metrics.bodyOverflow === "hidden",
    `${screenshotName}: background scroll must be locked`,
  );

  if (metrics.dialogBox) {
    assert(
      metrics.dialogBox.top >= 0 &&
        metrics.dialogBox.left >= 0 &&
        metrics.dialogBox.right <= metrics.viewport.width + 1 &&
        metrics.dialogBox.bottom <= metrics.viewport.height + 1,
      `${screenshotName}: dialog must fit viewport`,
    );
  }

  if (metrics.okButtonBox) {
    assert(
      metrics.okButtonBox.bottom <= metrics.viewport.height + 1 &&
        metrics.okButtonBox.top >= 0,
      `${screenshotName}: confirm button must stay inside viewport`,
    );
  }

  if (metrics.navBox && metrics.dialogBox) {
    assert(
      metrics.dialogBox.bottom <= metrics.viewport.height + 1,
      `${screenshotName}: bottom sheet must not extend below viewport`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({
    path: join(OUT_DIR, screenshotName),
    fullPage: false,
  });

  await page.getByRole("button", { name: "Понятно" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5_000 });

  const installStillVisible = await installButton.isVisible();
  assert(installStillVisible, `${screenshotName}: install row must remain after close`);

  return metrics;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: ANDROID_UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("audiolad_analytics_cookies", "denied");
    window.localStorage.removeItem("audiolad_pwa_device_state");
  });
  await context.addCookies(await getAuthCookies(BASE));
  const page = await context.newPage();

  const wideMetrics = await runViewportCheck(
    page,
    { width: 390, height: 844 },
    "android-390-instructions-open.png",
  );

  assert(
    wideMetrics.subtitleDisplay !== "none",
    "390px viewport should show install subtitle",
  );

  const narrowMetrics = await runViewportCheck(
    page,
    { width: 360, height: 780 },
    "android-360-subtitle-hidden.png",
  );

  assert(
    narrowMetrics.subtitleDisplay === "none",
    "360px viewport should hide install subtitle",
  );

  await browser.close();

  const report = {
    baseUrl: BASE,
    checkedAt: new Date().toISOString(),
    viewports: ["390x844", "360x780"],
    wideMetrics,
    narrowMetrics,
    screenshots: [
      "android-390-instructions-open.png",
      "android-360-subtitle-hidden.png",
    ],
  };

  writeFileSync(METRICS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log("PASS: profile PWA install visual smoke");
  console.log(`screenshot: ${join(OUT_DIR, "android-390-instructions-open.png")}`);
  console.log(`metrics: ${METRICS_PATH}`);
}

main().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
