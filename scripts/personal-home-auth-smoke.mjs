#!/usr/bin/env node
/**
 * Production-like authenticated home smoke for local or remote base URL.
 *
 * Usage:
 *   node scripts/personal-home-auth-smoke.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3001";

function loadEnv() {
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
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
    {
      ...cookieBase,
      name: `sb-${projectRef}-auth-token.0`,
      value: payload,
    },
  ];
}

async function assertAuthenticatedHome(page, label) {
  const pageErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(3000);

  const errorVisible = await page
    .getByText(/This page couldn't load|couldn.t load/i)
    .isVisible()
    .catch(() => false);

  if (errorVisible) {
    throw new Error(`${label}: global_error_visible`);
  }

  if (pageErrors.length > 0) {
    throw new Error(`${label}: pageerror:${pageErrors[0]}`);
  }

  const greetingVisible = await page
    .getByLabel("Персональное приветствие")
    .isVisible()
    .catch(() => false);

  if (!greetingVisible) {
    throw new Error(`${label}: personal_greeting_missing`);
  }

  const guestHeroVisible = await page
    .getByText("Аудио, которое помогает вернуться к себе")
    .isVisible()
    .catch(() => false);

  if (guestHeroVisible) {
    throw new Error(`${label}: guest_home_rendered_for_authenticated_user`);
  }
}

async function runGuestCheck(page) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(2000);

  const errorVisible = await page
    .getByText(/This page couldn't load|couldn.t load/i)
    .isVisible()
    .catch(() => false);

  if (errorVisible) {
    throw new Error("guest: global_error_visible");
  }

  const heroVisible = await page
    .getByText("Аудио, которое помогает вернуться к себе")
    .isVisible()
    .catch(() => false);

  if (!heroVisible) {
    throw new Error("guest: hero_missing");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  await runGuestCheck(page);

  const cookies = await getAuthCookies(BASE);
  await context.addCookies(cookies);

  await assertAuthenticatedHome(page, "authenticated_direct");
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  await assertAuthenticatedHome(page, "authenticated_reload");

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertAuthenticatedHome(page, "authenticated_desktop");

  await page.goto(`${BASE}/profile`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(2000);
  await assertAuthenticatedHome(page, "authenticated_from_profile");

  console.log(
    JSON.stringify(
      {
        base: BASE,
        ok: true,
        checks: [
          "guest_home",
          "authenticated_direct",
          "authenticated_reload",
          "authenticated_desktop",
          "authenticated_from_profile",
        ],
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
