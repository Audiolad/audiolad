#!/usr/bin/env node
import "./lib/assert-playwright-allowed.mjs";
/**
 * Player persistence across catalog → profile → author-dashboard.
 * Usage: AUDIOLAD_ALLOW_PLAYWRIGHT=1 node scripts/listener-shell-player-persistence-smoke.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const LISTEN_PATH = "/listen/sergey-and-zoya/klyuch-k-izobiliyu?autoplay=1";

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

async function readAudioState(page) {
  return page.evaluate(() => {
    const audio = document.querySelector("audio");
    return {
      paused: audio?.paused ?? true,
      currentTime: audio?.currentTime ?? 0,
      src: audio?.currentSrc || audio?.src || "",
    };
  });
}

async function assertDesktopPlayerBar(page) {
  const visible = await page.locator(".desktop-player-bar").isVisible();
  if (!visible) {
    throw new Error("desktop player bar must be visible in shell-integrated route");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(`${BASE}${LISTEN_PATH}`, { waitUntil: "networkidle" });

    const playButton = page.getByRole("button", { name: /Воспроизвести|Play/i });
    if (await playButton.isVisible().catch(() => false)) {
      await playButton.click();
    }

    await waitForAudioPlaying(page);
    const beforeProfile = await readAudioState(page);

    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await assertDesktopPlayerBar(page);

    const onProfile = await readAudioState(page);
    if (onProfile.paused) {
      throw new Error("audio paused after navigating to profile");
    }
    if (onProfile.currentTime + 0.75 < beforeProfile.currentTime) {
      throw new Error(
        `audio regressed on profile nav: before=${beforeProfile.currentTime} after=${onProfile.currentTime}`,
      );
    }

    await page.goto(`${BASE}/author-dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await assertDesktopPlayerBar(page);

    const onAuthor = await readAudioState(page);
    if (onAuthor.paused) {
      throw new Error("audio paused after navigating to author-dashboard");
    }

    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const backOnProfile = await readAudioState(page);
    if (backOnProfile.paused) {
      throw new Error("audio paused after returning to profile");
    }

    console.log("listener-shell-player-persistence-smoke: ok");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
