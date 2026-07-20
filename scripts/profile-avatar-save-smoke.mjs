#!/usr/bin/env node
/**
 * Profile avatar save smoke: crop confirm uploads, persists after reload.
 * Usage: AUDIT_BASE_URL=http://127.0.0.1:3017 node scripts/profile-avatar-save-smoke.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "playwright";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  bootstrapDataWriteScript,
  assertProjectEnvLocalSafeForFixtures,
} from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/profile-avatar-save-smoke.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3017";
const OUT_DIR = path.resolve("scripts/screenshots/profile-avatar-save-smoke");
const TEST_EMAIL = process.env.AVATAR_SMOKE_EMAIL ?? "1@audiolad.ru";

function loadEnv() {
  assertProjectEnvLocalSafeForFixtures({ envPath: path.resolve(".env.local") });
  return Object.fromEntries(
    readFileSync(path.resolve(".env.local"), "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

async function authCookies(baseUrl, email) {
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
    email,
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error(`auth_link_failed:${error?.message ?? "missing_token"}`);
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session) {
    throw new Error(`auth_verify_failed:${verifyError?.message ?? "no_session"}`);
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

  return {
    cookies: [
      {
        ...cookieBase,
        name: `sb-${projectRef}-auth-token`,
        value: JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
          expires_in: data.session.expires_in,
          token_type: data.session.token_type,
          user: data.session.user,
        }),
      },
    ],
    userId: data.session.user.id,
    env,
  };
}

async function createFixtures() {
  const fixtureDir = path.resolve("scripts/fixtures/profile-avatar-save");
  await mkdir(fixtureDir, { recursive: true });

  const jpegSmall = path.join(fixtureDir, "small.jpg");
  const jpegLarge = path.join(fixtureDir, "large.jpg");
  const pngFile = path.join(fixtureDir, "sample.png");
  const cyrillicFile = path.join(fixtureDir, "фото.jpg");

  await sharp({
    create: {
      width: 640,
      height: 640,
      channels: 3,
      background: { r: 120, g: 80, b: 180 },
    },
  })
    .jpeg({ quality: 90 })
    .toFile(jpegSmall);

  await sharp({
    create: {
      width: 2200,
      height: 2200,
      channels: 3,
      background: { r: 80, g: 140, b: 200 },
    },
  })
    .jpeg({ quality: 92 })
    .toFile(jpegLarge);

  await sharp({
    create: {
      width: 900,
      height: 900,
      channels: 4,
      background: { r: 200, g: 120, b: 80, alpha: 0.85 },
    },
  })
    .png()
    .toFile(pngFile);

  await sharp(jpegSmall).toFile(cyrillicFile);

  return { jpegSmall, jpegLarge, pngFile, cyrillicFile };
}

async function readProfileAvatar(env, userId) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await admin
    .from("profiles")
    .select("avatar_path, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`profile_read_failed:${error.message}`);
  }

  return data;
}

async function runScenario({
  browserType,
  viewport,
  fixturePath,
  label,
  userId,
  env,
  cookies,
}) {
  const browser =
    browserType === "webkit"
      ? await webkit.launch({ headless: true }).catch(() => null)
      : await chromium.launch({ headless: true });

  if (!browser) {
    return {
      label,
      browserType,
      viewport,
      fixturePath,
      skipped: true,
      errors: [],
    };
  }

  const context = await browser.newContext({
    viewport,
    ...(browserType === "webkit" ? { isMobile: true, hasTouch: true } : {}),
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  const report = {
    label,
    browserType,
    viewport,
    fixturePath,
    uploadStatus: null,
    uploadBody: null,
    avatarPathBefore: null,
    avatarPathAfter: null,
    reloadHasAvatar: false,
    successVisible: false,
    errors: [],
  };

  try {
    report.avatarPathBefore = (await readProfileAvatar(env, userId))?.avatar_path ?? null;

    await page.goto(`${BASE_URL}/profile/edit`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(OUT_DIR, `${label}-before.png`),
      fullPage: true,
    });

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/profile/avatar") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Изменить фотографию" }).first().click(),
    ]);
    await fileChooser.setFiles(fixturePath);

    const dialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: "Настройте фотографию" });
    await dialog.waitFor({ timeout: 20000 });
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(OUT_DIR, `${label}-crop-preview.png`),
      fullPage: true,
    });

    const saveButton = dialog.getByRole("button", { name: "Сохранить" });
    await saveButton.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(
      (button) => !(button instanceof HTMLButtonElement) || !button.disabled,
      await saveButton.elementHandle(),
      { timeout: 10000 },
    );
    await saveButton.click();
    const uploadResponse = await uploadResponsePromise;
    report.uploadStatus = uploadResponse.status();
    report.uploadBody = await uploadResponse.json().catch(() => null);

    await page.getByText("Фотография обновлена.").waitFor({ timeout: 20000 });
    report.successVisible = true;

    await page.screenshot({
      path: path.join(OUT_DIR, `${label}-after-save.png`),
      fullPage: true,
    });

    await page.reload({ waitUntil: "networkidle" });
    report.avatarPathAfter = (await readProfileAvatar(env, userId))?.avatar_path ?? null;
    report.reloadHasAvatar = Boolean(
      await page.locator('button[aria-label="Изменить фотографию"] img').count(),
    );

    await page.screenshot({
      path: path.join(OUT_DIR, `${label}-after-reload.png`),
      fullPage: true,
    });

    if (report.uploadStatus !== 200) {
      report.errors.push(`upload_status_${report.uploadStatus}`);
    }
    if (!report.avatarPathAfter) {
      report.errors.push("avatar_path_missing_after_upload");
    }
    if (report.avatarPathBefore === report.avatarPathAfter) {
      report.errors.push("avatar_path_unchanged");
    }
    if (!report.reloadHasAvatar) {
      report.errors.push("reload_ui_missing_avatar");
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    await page.screenshot({
      path: path.join(OUT_DIR, `${label}-failure.png`),
      fullPage: true,
    }).catch(() => undefined);
  } finally {
    await context.close();
    await browser.close();
  }

  return report;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const fixtures = await createFixtures();
  const { cookies, userId, env } = await authCookies(BASE_URL, TEST_EMAIL);

  const scenarios = [
    {
      browserType: "chromium",
      viewport: { width: 390, height: 844 },
      fixturePath: fixtures.jpegSmall,
      label: "mobile-chromium-jpeg-small",
    },
    {
      browserType: "chromium",
      viewport: { width: 390, height: 844 },
      fixturePath: fixtures.jpegLarge,
      label: "mobile-chromium-jpeg-large",
    },
    {
      browserType: "chromium",
      viewport: { width: 390, height: 844 },
      fixturePath: fixtures.pngFile,
      label: "mobile-chromium-png",
    },
    {
      browserType: "chromium",
      viewport: { width: 390, height: 844 },
      fixturePath: fixtures.cyrillicFile,
      label: "mobile-chromium-cyrillic-name",
    },
    {
      browserType: "webkit",
      viewport: { width: 390, height: 844 },
      fixturePath: fixtures.jpegSmall,
      label: "mobile-webkit-jpeg-small",
    },
  ];

  const results = [];

  for (const scenario of scenarios) {
    results.push(
      await runScenario({
        ...scenario,
        userId,
        env,
        cookies,
      }),
    );
  }

  await writeFile(
    path.join(OUT_DIR, "report.json"),
    `${JSON.stringify({ baseUrl: BASE_URL, results }, null, 2)}\n`,
  );

  const failed = results.filter((result) => result.errors.length > 0);
  if (failed.length > 0) {
    console.error("profile-avatar-save-smoke: failed", failed);
    process.exit(1);
  }

  console.log(`profile-avatar-save-smoke: ok (${OUT_DIR})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
