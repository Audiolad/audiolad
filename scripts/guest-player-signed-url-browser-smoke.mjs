#!/usr/bin/env node
/**
 * Observe listen network requests before and after Play on guest home bootstrap.
 *
 * Usage:
 *   AUDIT_BASE_URL=http://127.0.0.1:3017 node scripts/guest-player-signed-url-browser-smoke.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3017";

function classifyRequest(url) {
  if (url.includes("/session")) {
    return "session-metadata";
  }

  if (url.match(/\/api\/listen\/product\/[^/]+\/[^/]+\/audio\//)) {
    return "signed-audio";
  }

  return null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const requests = [];

page.on("request", (request) => {
  const kind = classifyRequest(request.url());

  if (kind) {
    requests.push({ phase: "pending", kind, url: request.url() });
  }
});

await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.removeItem("audiolad:desktop-player-last-session");
  localStorage.setItem("audiolad_analytics_cookies", "granted");
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3000);

for (const entry of requests) {
  entry.phase = "before-play";
}

const beforePlay = {
  sessionMetadata: requests.filter(
    (entry) => entry.phase === "before-play" && entry.kind === "session-metadata",
  ).length,
  signedAudio: requests.filter(
    (entry) => entry.phase === "before-play" && entry.kind === "signed-audio",
  ).length,
};

const beforeClickAudio = await page.evaluate(() => {
  const audio = document.querySelector("audio.global-audio-element");
  return {
    paused: audio?.paused ?? null,
    currentSrc: audio?.currentSrc || audio?.src || null,
  };
});

const playButton = page.locator('.desktop-player-bar button[aria-label="Воспроизвести"]').first();
if (!(await playButton.count())) {
  throw new Error("desktop play button not found after guest bootstrap");
}

await playButton.click();
await page.waitForTimeout(3000);

for (const entry of requests) {
  if (entry.phase === "pending") {
    entry.phase = "after-play";
  }
}

const afterPlayOnly = requests.filter((entry) => entry.phase === "after-play");
const metrics = {
  beforePlay,
  afterPlay: {
    sessionMetadata: afterPlayOnly.filter((entry) => entry.kind === "session-metadata").length,
    signedAudio: afterPlayOnly.filter((entry) => entry.kind === "signed-audio").length,
  },
  sampleSignedBeforePlay: requests.find(
    (entry) => entry.phase === "before-play" && entry.kind === "signed-audio",
  )?.url ?? null,
  sampleSignedAfterPlay: afterPlayOnly.find((entry) => entry.kind === "signed-audio")?.url ?? null,
  beforeClickAudio,
};

console.log(JSON.stringify(metrics, null, 2));

if (beforePlay.sessionMetadata < 1) {
  throw new Error("expected session metadata request before play");
}

if (beforePlay.signedAudio < 1) {
  throw new Error(
    "expected signed audio request before play — current player architecture prefetches source on session mount",
  );
}

if (beforeClickAudio.paused !== true) {
  throw new Error(`autoplay started before explicit play click: ${JSON.stringify(beforeClickAudio)}`);
}

const afterClickAudio = await page.evaluate(() => {
  const audio = document.querySelector("audio.global-audio-element");
  return {
    paused: audio?.paused ?? null,
    currentSrc: audio?.currentSrc || audio?.src || null,
  };
});

if (!afterClickAudio.currentSrc) {
  throw new Error("audio element has no src after play click");
}

await browser.close();
console.log("guest-player-signed-url-browser-smoke: ok");
