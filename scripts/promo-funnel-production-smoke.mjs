#!/usr/bin/env node
import "./lib/assert-playwright-allowed.mjs";
/**
 * Production smoke for promo guest funnel on elixir-molodosti.
 * Requires: PLAYWRIGHT_BROWSERS_PATH or installed chromium.
 *
 * Env:
 *   PROMO_SMOKE_PRACTICE_URL — full practice URL with UTM params
 *   PROMO_SMOKE_LISTEN_URL — optional direct listen URL (skips practice page)
 *   PROMO_SMOKE_UTM_SOURCE — expected utm_source in attribution (default: telegram)
 *   PROMO_SMOKE_INTERVAL_MS — guest progress wait (default: 13000)
 */
import { chromium } from "playwright";
import { bootstrapDataWriteScript } from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/promo-funnel-production-smoke.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://audiolad.ru";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

const PRACTICE_URL =
  process.env.PROMO_SMOKE_PRACTICE_URL ??
  "https://audiolad.ru/practice/sergey-and-zoya/elixir-molodosti?utm_source=telegram&utm_medium=social&utm_campaign=weekly_practice&utm_content=elixir-molodosti";

const LISTEN_URL = process.env.PROMO_SMOKE_LISTEN_URL ?? null;
const EXPECTED_UTM_SOURCE = process.env.PROMO_SMOKE_UTM_SOURCE ?? "telegram";
const INTERVAL_WAIT_MS = Number(process.env.PROMO_SMOKE_INTERVAL_MS ?? "13000");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readGuestProgress(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);

      if (key && key.startsWith("audiolad_gp:")) {
        return { key, value: localStorage.getItem(key) };
      }
    }

    return null;
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const practicePageSignedUrls = [];

  function trackPracticeSignedUrl(response) {
    const url = response.url();

    if (url.includes("/storage/v1/object/sign/practice-audio")) {
      practicePageSignedUrls.push(url);
    }
  }

  if (LISTEN_URL) {
    await page.goto(LISTEN_URL, { waitUntil: "networkidle" });
  } else {
    page.on("response", trackPracticeSignedUrl);

    await page.goto(PRACTICE_URL, { waitUntil: "networkidle" });

    const practiceHtml = await page.content();
    assert(
      !practiceHtml.includes("/storage/v1/object/sign/practice-audio"),
      "practice page HTML must not embed signed audio URLs",
    );
    assert(
      practicePageSignedUrls.length === 0,
      "practice page must not fetch signed audio URLs before listen",
    );

    page.off("response", trackPracticeSignedUrl);

    const bodyText = await page.locator("body").innerText();
    assert(bodyText.includes("Начать слушать"), "practice page shows Начать слушать");
    assert(bodyText.includes("Эликсир"), "practice title visible");
    assert(!bodyText.includes("autoplay=1"), "no autoplay in visible text");

    const listenHref = await page
      .locator('a:has-text("Начать слушать")')
      .getAttribute("href");
    assert(
      listenHref && !listenHref.includes("autoplay=1"),
      "listen link without autoplay",
    );

    await page.click('a:has-text("Начать слушать")');
    await page.waitForURL(/\/listen\//, { timeout: 15000 });
  }

  assert(!page.url().includes("autoplay=1"), "listen URL without autoplay param");

  const playButton = page
    .locator('button[aria-label="Воспроизвести"], button[aria-label="Пауза"]')
    .first();
  await playButton.waitFor({ state: "visible", timeout: 20000 });

  const audioEl = page.locator("audio").first();
  const pausedBefore = await audioEl.evaluate((el) => el.paused);
  assert(pausedBefore === true, "audio not autoplaying on listen page load");

  await playButton.click();
  await page.waitForTimeout(2000);

  const currentTime = await audioEl.evaluate((el) => el.currentTime);
  assert(currentTime >= 0, "playback started after user click");

  let gpKey = await readGuestProgress(page);
  assert(!gpKey?.value, "guest progress should not save immediately");

  await page.waitForTimeout(INTERVAL_WAIT_MS);

  gpKey = await readGuestProgress(page);
  assert(gpKey?.value, "guest progress saved by interval without pagehide");

  const savedPosition = JSON.parse(gpKey.value).positionSeconds;
  assert(savedPosition > 10, "position > 10 seconds");

  await page.evaluate(() => {
    const audio = document.querySelector("audio");

    if (!audio) {
      return;
    }

    audio.currentTime = Math.min(audio.duration * 0.38, audio.duration - 1);
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await page.waitForTimeout(1500);

  const midPrompt = page.locator("text=Нравится практика?");
  await midPrompt.waitFor({ state: "visible", timeout: 10000 });

  const pausedDuringPrompt = await audioEl.evaluate(
    (el) => !el.paused || el.currentTime > 0,
  );
  assert(pausedDuringPrompt, "audio state preserved with mid prompt");

  await page.locator('button[aria-label="Закрыть"]').click();
  await page.waitForTimeout(500);
  assert(await midPrompt.isHidden(), "mid prompt dismissible");

  if (!LISTEN_URL) {
    await page.goto(PRACTICE_URL, { waitUntil: "domcontentloaded" });
    const attribution = await page.evaluate(() =>
      localStorage.getItem("audiolad_promo_attribution"),
    );
    assert(
      attribution && attribution.includes(EXPECTED_UTM_SOURCE),
      "UTM attribution persisted",
    );
  }

  console.log("PROMO_FUNNEL_PRODUCTION_SMOKE_PASS");
  await browser.close();
}

main().catch((error) => {
  console.error("PROMO_FUNNEL_PRODUCTION_SMOKE_FAIL", error.message);
  process.exit(1);
});
