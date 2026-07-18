#!/usr/bin/env node
/**
 * Browser smoke: guest player stays empty until explicit play.
 *
 * Usage:
 *   AUDIT_BASE_URL=http://127.0.0.1:3000 node scripts/guest-player-bootstrap-browser-smoke.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const ZHENSKIE_URL =
  `${BASE_URL}/practice/zoya-petrova/zhenskie-dengi?utm_source=test&utm_medium=smoke`;

async function dismissConsent(page) {
  for (const label of ["Разрешить", "Отклонить"]) {
    const button = page.getByRole("button", { name: label });
    if (await button.count()) {
      await button.first().click().catch(() => {});
      break;
    }
  }
}

async function resetGuestStorage(page) {
  await page.evaluate(() => {
    localStorage.removeItem("audiolad:desktop-player-last-session");
    localStorage.setItem("audiolad_analytics_cookies", "granted");
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("audiolad_gp:")) {
        localStorage.removeItem(key);
      }
    }
  });
}

function playerMetrics() {
  const bar = document.querySelector(".desktop-player-bar");
  const sidebar = document.querySelector('[aria-label="Сейчас играет"]');
  const mini = document.querySelector(".global-mini-player");
  const miniStyle = mini ? getComputedStyle(mini) : null;
  const rootMiniHeight = getComputedStyle(document.documentElement)
    .getPropertyValue("--global-mini-player-height")
    .trim();

  return {
    hasBar: Boolean(bar),
    emptySidebar: sidebar?.textContent?.includes("Пока ничего не играет") ?? false,
    sidebarTitle: sidebar?.querySelector("h3")?.textContent?.trim() ?? null,
    miniVisible:
      Boolean(mini) &&
      miniStyle?.display !== "none" &&
      miniStyle?.visibility !== "hidden",
    miniHeight: rootMiniHeight,
    audioCount: document.querySelectorAll("audio.global-audio-element").length,
  };
}

async function assertEmptyGuestHome(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await resetGuestStorage(page);
  await page.reload({ waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(2500);

  const metrics = await page.evaluate(playerMetrics);

  if (metrics.hasBar || !metrics.emptySidebar || metrics.miniVisible) {
    throw new Error(`guest home should stay empty (${viewport.width}x${viewport.height}): ${JSON.stringify(metrics)}`);
  }

  if (metrics.miniHeight !== "0px") {
    throw new Error(`mini-player height should be 0px: ${metrics.miniHeight}`);
  }

  console.log(`empty-guest-home-${viewport.width}: ok`, JSON.stringify(metrics));
}

async function assertZhenskiePromoFlow(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ZHENSKIE_URL, { waitUntil: "networkidle" });
  await resetGuestStorage(page);
  await page.reload({ waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(2000);

  const before = await page.evaluate(() => {
    const bar = document.querySelector(".desktop-player-bar");
    const sidebar = document.querySelector('[aria-label="Сейчас играет"]');
    const mini = document.querySelector(".global-mini-player");
    const miniStyle = mini ? getComputedStyle(mini) : null;
    const rootMiniHeight = getComputedStyle(document.documentElement)
      .getPropertyValue("--global-mini-player-height")
      .trim();

    return {
      hasBar: Boolean(bar),
      emptySidebar: sidebar?.textContent?.includes("Пока ничего не играет") ?? false,
      sidebarTitle: sidebar?.querySelector("h3")?.textContent?.trim() ?? null,
      miniVisible:
        Boolean(mini) &&
        miniStyle?.display !== "none" &&
        miniStyle?.visibility !== "hidden",
      miniHeight: rootMiniHeight,
      pageHasKlyuch: document.body.textContent?.includes("Ключ к Изобилию") ?? false,
    };
  });

  if (before.hasBar || before.sidebarTitle || before.miniVisible) {
    throw new Error(`promo page should start empty: ${JSON.stringify(before)}`);
  }

  if (before.pageHasKlyuch) {
    throw new Error("promo page should not mention Ключ к Изобiliю in player chrome");
  }

  const listenButton = page.getByRole("link", { name: /Слушать|Начать слушать/i }).first();
  await listenButton.click();
  await page.waitForURL(/\/listen\//, { timeout: 30000 });
  await page.waitForTimeout(3500);

  const afterListen = await page.evaluate(() => {
    const sidebarTitle = document.querySelector('[aria-label="Сейчас играет"] h3')?.textContent?.trim() ?? null;
    const barTitle = document.querySelector(".desktop-player-bar p.font-semibold")?.textContent?.trim() ?? null;
    const audio = document.querySelector("audio.global-audio-element");
    const coverImg = document.querySelector(".desktop-player-bar img, .global-mini-player img");
    return {
      path: location.pathname,
      sidebarTitle,
      barTitle,
      hasKlyuch: [sidebarTitle, barTitle].some((value) => value?.includes("Ключ к Изобилию")),
      hasZhenskie: [sidebarTitle, barTitle, document.body.textContent].some((value) =>
        typeof value === "string" ? value.includes("Женские деньги") : false,
      ),
      audioPaused: audio?.paused ?? null,
      hasCover: Boolean(coverImg?.getAttribute("src")),
      coverSrc: coverImg?.getAttribute("src") ?? null,
    };
  });

  if (!afterListen.path.includes("zhenskie-dengi") || afterListen.hasKlyuch || !afterListen.hasZhenskie) {
    throw new Error(`promo listen loaded wrong practice: ${JSON.stringify(afterListen)}`);
  }

  console.log("promo-zhenskie-play: ok", JSON.stringify(afterListen));
}

async function assertPersistedSessionReload(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await resetGuestStorage(page);
  await page.reload({ waitUntil: "networkidle" });
  await dismissConsent(page);

  await page.evaluate(() => {
    localStorage.setItem(
      "audiolad:desktop-player-last-session",
      JSON.stringify({
        practiceId: "saved-practice",
        authorSlug: "zoya-petrova",
        productSlug: "zhenskie-dengi",
      }),
    );
  });

  await page.reload({ waitUntil: "networkidle" });
  await dismissConsent(page);
  await page.waitForTimeout(3500);

  const metrics = await page.evaluate(() => {
    const sidebarTitle = document.querySelector('[aria-label="Сейчас играет"] h3')?.textContent?.trim() ?? null;
    const barTitle = document.querySelector(".desktop-player-bar p.font-semibold")?.textContent?.trim() ?? null;
    return {
      sidebarTitle,
      barTitle,
      hasBar: Boolean(document.querySelector(".desktop-player-bar")),
      hasZhenskie: [sidebarTitle, barTitle].some((value) => value?.includes("Женские деньги")),
    };
  });

  if (!metrics.hasBar || !metrics.hasZhenskie) {
    throw new Error(`persisted session should restore zhenskie-dengi: ${JSON.stringify(metrics)}`);
  }

  console.log("persisted-session-reload: ok", JSON.stringify(metrics));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await assertEmptyGuestHome(page, { width: 1440, height: 900 });
  await assertEmptyGuestHome(page, { width: 390, height: 844 });
  await assertZhenskiePromoFlow(page);
  await assertPersistedSessionReload(page);
  console.log("guest-player-bootstrap-browser-smoke: ok");
} finally {
  await browser.close();
}
