#!/usr/bin/env node
/**
 * Visual smoke for AvatarCropperModal on desktop and mobile viewports.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "screenshots/avatar-cropper");
const BASE_URL = process.env.BASE_URL?.trim() || "http://127.0.0.1:3029";

const FIXTURES = {
  landscape: join(__dirname, "fixtures/avatar-crop/landscape.jpg"),
  portrait: join(__dirname, "fixtures/avatar-crop/portrait.jpg"),
};

function loadEnv() {
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

async function ownerSession(env) {
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
  const { data: link } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "1@audiolad.ru",
  });
  const { data } = await pub.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });

  return data.session;
}

function authCookies(session, env, baseUrl) {
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const host = new URL(baseUrl).hostname;

  return [
    {
      domain: host,
      path: "/",
      name: `sb-${ref}-auth-token`,
      value: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      }),
      httpOnly: false,
      secure: baseUrl.startsWith("https"),
      sameSite: "Lax",
    },
  ];
}

async function ensureFixtures() {
  mkdirSync(dirname(FIXTURES.landscape), { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const sharp = (await import("sharp")).default;

  await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 120, g: 80, b: 180 },
    },
  })
    .jpeg({ quality: 90 })
    .toFile(FIXTURES.landscape);

  await sharp({
    create: {
      width: 900,
      height: 1600,
      channels: 3,
      background: { r: 80, g: 140, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .toFile(FIXTURES.portrait);
}

async function pickImage(page, trigger, filePath) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    trigger.click(),
  ]);

  await fileChooser.setFiles(filePath);
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    localStorage.setItem("audiolad-analytics-consent", "declined");
  });

  await page.keyboard.press("Escape").catch(() => undefined);
}

async function captureCropper(page, name) {
  await page.locator('[role="dialog"]').filter({ hasText: "Настройте фотографию" }).waitFor({
    timeout: 20000,
  });
  await page.waitForTimeout(900);
  await page.screenshot({
    path: join(OUTPUT_DIR, `${name}.png`),
    fullPage: false,
  });
}

async function closeCropper(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

async function dismissCookieBanner(page) {
  await dismissOverlays(page);
}

async function main() {
  await ensureFixtures();

  const env = loadEnv();
  const session = await ownerSession(env);
  const browser = await chromium.launch({ headless: true });

  const contexts = [
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "mobile-390", width: 390, height: 844 },
  ];

  for (const viewport of contexts) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    await context.addCookies(authCookies(session, env, BASE_URL));
    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/profile/edit`, {
        waitUntil: "networkidle",
      });
      await dismissCookieBanner(page);
      await pickImage(
        page,
        page.getByRole("button", { name: "Изменить фотографию" }).first(),
        FIXTURES.portrait,
      );
      await captureCropper(page, `profile-cropper-${viewport.name}`);
      await closeCropper(page);

      await page.goto(`${BASE_URL}/author-dashboard/profile`, {
        waitUntil: "networkidle",
      });
      await dismissCookieBanner(page);
      await pickImage(
        page,
        page
          .locator("span", { hasText: "Фотография или логотип" })
          .locator("..")
          .getByRole("button", { name: "Загрузить" })
          .first(),
        FIXTURES.landscape,
      );
      await captureCropper(page, `author-cropper-${viewport.name}`);
    } catch (error) {
      console.error(`avatar-cropper-screenshot failed for ${viewport.name}:`, error);
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }

  await browser.close();

  if (!process.exitCode) {
    console.log(`avatar-cropper-screenshot: ok (${OUTPUT_DIR})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
