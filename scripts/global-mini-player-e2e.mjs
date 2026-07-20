#!/usr/bin/env node
import "./lib/assert-playwright-allowed.mjs";
/**
 * Smoke E2E for global mini-player continuity.
 * Usage: node scripts/global-mini-player-e2e.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { bootstrapDataWriteScript } from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/global-mini-player-e2e.mjs";
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

const BASE = process.argv[2] ?? "http://localhost:3000";
const LISTEN_PATH = "/listen/sergey-and-zoya/klyuch-k-izobiliyu?autoplay=1";

const results = [];
const pass = (name) => results.push({ name, ok: true });
const fail = (name, detail) => results.push({ name, ok: false, detail });

async function waitForAudioPlaying(page, timeoutMs = 20_000) {
  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return Boolean(audio && !audio.paused && audio.currentTime > 0.05);
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(`${BASE}${LISTEN_PATH}`, { waitUntil: "networkidle" });

    const playButton = page.getByRole("button", { name: /Воспроизвести|Play/i });
    if (await playButton.isVisible().catch(() => false)) {
      await playButton.click();
    }

    await waitForAudioPlaying(page);
    pass("listen_autoplay_or_manual_play");

    await page.waitForTimeout(4000);

    const timeBeforeNav = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio?.currentTime ?? 0;
    });

    await page.locator('.bottom-nav a[aria-label="Каталог"]').click();
    await page.waitForURL(/\/catalog/, { timeout: 10_000 });
    pass("navigate_to_catalog");

    await page.waitForSelector(".global-mini-player", { timeout: 10_000 });
    pass("mini_player_visible_on_catalog");

    await page.screenshot({
      path: "/var/www/audiolad/screenshots/global-mini-player-catalog-390.png",
      fullPage: false,
    });
    pass("mini_player_catalog_screenshot");

    await page.waitForTimeout(1500);

    await page.waitForFunction(
      () => {
        const audio = document.querySelector("audio");
        return Boolean(audio && !audio.paused);
      },
      undefined,
      { timeout: 10_000 },
    );
    pass("audio_still_playing_after_catalog_nav");

    const timeAfterNav = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio?.currentTime ?? 0;
    });

    if (timeAfterNav >= timeBeforeNav - 1) {
      pass("playback_position_preserved");
    } else {
      fail(
        "playback_position_preserved",
        `before=${timeBeforeNav.toFixed(2)} after=${timeAfterNav.toFixed(2)}`,
      );
    }

    const audioCount = await page.evaluate(
      () => document.querySelectorAll("audio").length,
    );

    if (audioCount === 1) {
      pass("single_audio_element");
    } else {
      fail("single_audio_element", String(audioCount));
    }

    await page
      .getByRole("button", { name: "Назад на 15 секунд" })
      .first()
      .click();

    await page.waitForTimeout(600);

    const timeAfterSeekBack = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio?.currentTime ?? 0;
    });

    const expectedAfterSeek = Math.max(0, timeAfterNav - 14);

    if (timeAfterSeekBack <= expectedAfterSeek + 1.5) {
      pass("mini_player_seek_back_15");
    } else {
      fail(
        "mini_player_seek_back_15",
        `afterNav=${timeAfterNav.toFixed(2)} afterSeek=${timeAfterSeekBack.toFixed(2)} expected<=${expectedAfterSeek.toFixed(2)}`,
      );
    }

    await page.getByRole("button", { name: "Пауза" }).first().click();
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      return Boolean(audio && audio.paused);
    });
    pass("mini_player_pause");

    await page.getByRole("button", { name: "Воспроизвести" }).first().click();
    await waitForAudioPlaying(page, 10_000);
    pass("mini_player_resume_play");

    await page
      .getByRole("button", {
        name: /Открыть полный плеер|Ключ к Изобiliю|Ключ/i,
      })
      .first()
      .click();
    await page.waitForURL(/\/listen\//, { timeout: 10_000 });
    pass("mini_player_open_full_player");

    await page.waitForFunction(
      () => {
        const audio = document.querySelector("audio");
        return Boolean(audio && !audio.paused);
      },
      undefined,
      { timeout: 10_000 },
    );
    pass("audio_still_playing_on_full_player");

    const miniOnListen = await page.locator(".global-mini-player").count();
    if (miniOnListen === 0) {
      pass("mini_player_hidden_on_listen_page");
    } else {
      fail("mini_player_hidden_on_listen_page", String(miniOnListen));
    }

    await page.screenshot({
      path: "/var/www/audiolad/screenshots/global-mini-player-full-390.png",
      fullPage: false,
    });

    await page.getByRole("link", { name: "Главная" }).click();
    await page.waitForURL(/\/$|\/\?/, { timeout: 10_000 });
    await page.waitForSelector(".global-mini-player", { timeout: 10_000 });
    await page.screenshot({
      path: "/var/www/audiolad/screenshots/global-mini-player-home-390.png",
      fullPage: false,
    });
    pass("mini_player_on_home_with_screenshot");

    await page.locator('.bottom-nav a[aria-label="Каталог"]').click();
    await page.waitForURL(/\/catalog/, { timeout: 10_000 });
    await page.waitForSelector(".global-mini-player", { timeout: 10_000 });
    await page.screenshot({
      path: "/var/www/audiolad/screenshots/global-mini-player-with-close-390.png",
      fullPage: false,
    });

    await page.getByRole("button", { name: "Закрыть плеер" }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".global-mini-player").length === 0,
      undefined,
      { timeout: 5000 },
    );
    pass("mini_player_close_button");

    await page.waitForFunction(
      () => {
        const audio = document.querySelector("audio");
        return !audio || !audio.src || audio.paused;
      },
      undefined,
      { timeout: 5000 },
    );
    pass("mini_player_close_stops_audio");
  } catch (error) {
    fail("unexpected_error", error instanceof Error ? error.message : String(error));
    await page.screenshot({
      path: "/var/www/audiolad/screenshots/global-mini-player-error-390.png",
      fullPage: true,
    }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`BASE: ${BASE}`);
  console.log("RESULTS:");
  for (const item of results) {
    console.log(
      `${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`,
    );
  }

  if (results.some((item) => !item.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
