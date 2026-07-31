#!/usr/bin/env node
/**
 * Browser smoke: private_audio → navigate → catalog ?autoplay=1 must not hang.
 *
 * Usage:
 *   AUDIOLAD_ALLOW_PLAYWRIGHT=1 node scripts/private-to-catalog-player-race-smoke.mjs [baseUrl]
 *
 * Optional:
 *   AUDIOLAD_SMOKE_VIEWPORT=mobile
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const LISTEN_PATH = "/listen/sergey-and-zoya/klyuch-k-izobiliyu?autoplay=1";
const MOBILE = process.env.AUDIOLAD_SMOKE_VIEWPORT === "mobile";
const MP3_CANDIDATES = [
  "/tmp/private-audio-smoke/tone.mp3",
  "/tmp/private-audio-smoke-2833083/tone.mp3",
];

function assertSafeTestEnvironment(env = process.env) {
  const required = [
    "AUDIOLAD_TEST_BASE_URL",
    "AUDIOLAD_TEST_SUPABASE_URL",
    "AUDIOLAD_TEST_SUPABASE_SERVICE_ROLE_KEY",
  ];
  if (env.AUDIOLAD_TEST_DATABASE !== "1") {
    throw new Error("private_catalog_race_requires_test_database_marker");
  }
  if (env.AUDIOLAD_ALLOW_MUTATING_SMOKE !== "1") {
    throw new Error("private_catalog_race_requires_explicit_mutation_opt_in");
  }
  for (const key of required) {
    if (!env[key]?.trim()) throw new Error(`private_catalog_race_missing_${key.toLowerCase()}`);
  }
  if (env.AUDIOLAD_TEST_DB_CONTAINER !== "audiolad-test-db") {
    throw new Error("private_catalog_race_requires_audiolad_test_db_container");
  }
  if (!/^audiolad_[a-z0-9_]+_test$/.test(env.AUDIOLAD_TEST_DB_NAME ?? "")) {
    throw new Error("private_catalog_race_requires_disposable_test_database");
  }
  const allowed = (value, label) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      host === "audiolad.ru" ||
      host.endsWith(".audiolad.ru") ||
      !(host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".test"))
    ) {
      throw new Error(`private_catalog_race_rejected_${label}_host`);
    }
    return url.toString().replace(/\/$/, "");
  };
  return {
    baseUrl: allowed(env.AUDIOLAD_TEST_BASE_URL, "base_url"),
    supabaseUrl: allowed(env.AUDIOLAD_TEST_SUPABASE_URL, "supabase_url"),
    serviceRoleKey: env.AUDIOLAD_TEST_SUPABASE_SERVICE_ROLE_KEY,
    publishableKey: env.AUDIOLAD_TEST_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}

function findMp3() {
  for (const candidate of MP3_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("missing smoke mp3 under /tmp/private-audio-smoke/");
}

async function createPrivateFixture(env) {
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const prefix = `e2e-private-catalog-race-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `${prefix}@example.test`;
  const password = `Sm0ke-${randomUUID().slice(0, 12)}!aA`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`createUser failed: ${createError?.message ?? "unknown"}`);
  }

  const userId = created.user.id;
  const itemId = randomUUID();
  const audioPath = `${prefix}/${userId}/${itemId}/audio.mp3`;
  const mp3 = readFileSync(findMp3());

  const { error: uploadError } = await admin.storage
    .from("private-audio-items")
    .upload(audioPath, mp3, { contentType: "audio/mpeg", upsert: false });
  if (uploadError) {
    throw new Error(`storage upload failed: ${uploadError.message}`);
  }

  const { error: insertError } = await admin.from("private_audio_items").insert({
    id: itemId,
    owner_user_id: userId,
    source_type: "manual_upload",
    title: `${prefix} Race Smoke Private Track`,
    author_text: "Smoke",
    audio_path: audioPath,
    cover_path: null,
    audio_mime_type: "audio/mpeg",
    audio_size_bytes: mp3.length,
    duration_seconds: 2,
    original_filename: "tone.mp3",
    rights_accepted_at: new Date().toISOString(),
  });
  if (insertError) {
    throw new Error(`insert failed: ${insertError.message}`);
  }

  return { admin, email, password, userId, itemId, audioPath };
}

async function authCookies(env, baseUrl, email, password) {
  if (!env.publishableKey) throw new Error("private_catalog_race_missing_publishable_key");
  const pub = createClient(
    env.supabaseUrl,
    env.publishableKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await pub.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signIn failed: ${error?.message ?? "no session"}`);
  }

  const projectRef = new URL(env.supabaseUrl).hostname.split(".")[0];
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
    { ...cookieBase, name: `sb-${projectRef}-auth-token`, value: payload },
    { ...cookieBase, name: `sb-${projectRef}-auth-token.0`, value: payload },
  ];
}

async function waitForAudioPlaying(page, timeoutMs = 25_000) {
  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return Boolean(audio && !audio.paused && audio.currentTime > 0.02);
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function readAudio(page) {
  return page.evaluate(() => {
    const audio = document.querySelector("audio");
    return {
      paused: audio?.paused ?? true,
      currentTime: audio?.currentTime ?? 0,
      src: audio?.currentSrc || audio?.src || "",
      count: document.querySelectorAll("audio").length,
    };
  });
}

async function assertNoPrepareFatal(page) {
  const body = await page.locator("body").innerText();
  if (body.includes("Не удалось подготовить аудио")) {
    throw new Error("prepare-audio error visible");
  }
}

async function cleanupFixture(fixture) {
  try {
    await fixture.admin.storage.from("private-audio-items").remove([fixture.audioPath]);
  } catch {
    // best-effort
  }
  try {
    await fixture.admin.from("private_audio_items").delete().eq("id", fixture.itemId);
  } catch {
    // best-effort
  }
  try {
    await fixture.admin.auth.admin.deleteUser(fixture.userId);
  } catch {
    // best-effort
  }
}

async function runViewport(label, viewport) {
  const env = assertSafeTestEnvironment();
  const fixture = await createPrivateFixture(env);
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const pageErrors = [];

  try {
    const context = await browser.newContext({ viewport });
    await context.addCookies(await authCookies(env, env.baseUrl, fixture.email, fixture.password));
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(`${env.baseUrl}/my-library/private-audio/${fixture.itemId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const play = page
      .locator(
        'button[aria-label*="Воспроизвести"], button[aria-label*="Play"], button:has-text("▶")',
      )
      .first();
    await play.click({ timeout: 15_000 });
    await waitForAudioPlaying(page);
    const privateState = await readAudio(page);
    if (privateState.count !== 1) {
      throw new Error(`expected 1 audio, got ${privateState.count}`);
    }

    // Client-side nav only — hard page.goto remounts the app and drops the player.
    const catalogNav = page
      .locator(
        'nav[aria-label="Моё пространство"] a[href="/catalog"], .bottom-nav a[aria-label="Каталог"]',
      )
      .locator("visible=true")
      .first();
    await catalogNav.click({ timeout: 10_000 });
    await page.waitForURL(/\/catalog/, { timeout: 15_000 });
    await page.waitForTimeout(800);
    const afterNav = await readAudio(page);
    if (afterNav.paused) {
      throw new Error("private audio paused after catalog nav");
    }

    await page.goto(`${env.baseUrl}${LISTEN_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const catalogPlay = page.getByRole("button", { name: /Воспроизвести|Play/i });
    if (await catalogPlay.isVisible().catch(() => false)) {
      await catalogPlay.click();
    }

    await waitForAudioPlaying(page, 30_000);
    await assertNoPrepareFatal(page);

    const bodyText = await page.locator("body").innerText();
    // Progress error may appear briefly; it must not freeze navigation.
    const hadProgressError = bodyText.includes("Не удалось сохранить прогресс");

    const catalogAgain = page
      .locator(
        'nav[aria-label="Моё пространство"] a[href="/catalog"], .bottom-nav a[aria-label="Каталог"]',
      )
      .locator("visible=true")
      .first();
    await catalogAgain.click({ timeout: 10_000 });
    await page.waitForURL(/\/catalog/, { timeout: 15_000 });
    await page.waitForTimeout(500);

    const libraryNav = page
      .locator(
        'nav[aria-label="Моё пространство"] a[href="/my-practices"], .bottom-nav a[aria-label="Аудиотека"]',
      )
      .locator("visible=true")
      .first();
    await libraryNav.click({ timeout: 10_000 });
    await page.waitForURL(/\/my-practices/, { timeout: 15_000 });

    // Private must appear in All filter (default).
    await page.waitForSelector("text=Race Smoke Private Track", { timeout: 15_000 });

    await page.getByRole("button", { name: "Мои загрузки" }).click();
    await page.waitForSelector("text=Race Smoke Private Track", { timeout: 10_000 });

    await page.getByRole("button", { name: "Купленные" }).click();
    await page.waitForURL(/filter=purchased/, { timeout: 10_000 });
    await page.waitForTimeout(400);
    const leakedInPurchased = await page
      .locator("text=Race Smoke Private Track")
      .locator("visible=true")
      .count();
    if (leakedInPurchased > 0) {
      throw new Error("private item leaked into Купленные");
    }

    await page.getByRole("button", { name: "Подарки" }).click();
    await page.waitForURL(/filter=gifts/, { timeout: 10_000 });
    await page.waitForTimeout(400);
    const leakedInGifts = await page
      .locator("text=Race Smoke Private Track")
      .locator("visible=true")
      .count();
    if (leakedInGifts > 0) {
      throw new Error("private item leaked into Подарки");
    }

    const fatalConsole = consoleErrors.filter(
      (line) =>
        !line.includes("favicon") &&
        !line.includes("Hydration") &&
        !line.includes("third-party"),
    );

    console.log(
      JSON.stringify({
        label,
        ok: true,
        hadProgressError,
        pageErrors,
        consoleErrorCount: fatalConsole.length,
        privateItemId: fixture.itemId,
      }),
    );
  } finally {
    await browser.close();
    await cleanupFixture(fixture);
  }

  if (pageErrors.length) {
    throw new Error(`${label} pageerrors: ${pageErrors.join(" | ")}`);
  }
}

async function main() {
  await import("./lib/assert-playwright-allowed.mjs");
  const viewport = MOBILE
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 };
  await runViewport(MOBILE ? "mobile" : "desktop", viewport);
  console.log("private-to-catalog-player-race-smoke: ok");
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "private_catalog_race_failed");
    process.exit(1);
  });
}

export { assertSafeTestEnvironment };
