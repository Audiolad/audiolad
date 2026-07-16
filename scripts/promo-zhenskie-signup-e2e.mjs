#!/usr/bin/env node
/**
 * Production E2E: promo signup funnel on «Женские деньги».
 *
 * Verifies the stable checkpoint documented in docs/PROMO_ZHENSKIE_FUNNEL_CHECKPOINT.md.
 * Requires: PLAYWRIGHT_BROWSERS_PATH or installed chromium.
 *
 * Creates a disposable test account (e2e-zhenskie-*@audiolad.ru). Do not delete automatically.
 */
import { chromium } from "playwright";

const PRACTICE_URL =
  process.env.PROMO_ZHENSKIE_E2E_URL ??
  "https://audiolad.ru/practice/zoya-petrova/zhenskie-dengi?utm_source=test&utm_medium=e2e&utm_campaign=zhenskie_dengi_signup_test&utm_content=main_post";

const EXPECTED_PRACTICES = [
  "Женские деньги",
  "Эликсир Молодости",
  "Ключ к Изобилию",
  "Код Притяжения",
];

const ts = Date.now();
const TEST_EMAIL = process.env.PROMO_ZHENSKIE_E2E_EMAIL ?? `e2e-zhenskie-${ts}@audiolad.ru`;
const TEST_PASSWORD = process.env.PROMO_ZHENSKIE_E2E_PASSWORD ?? "E2eTestPass123!";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const completeSignupResponses = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/promo/complete-signup")) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      completeSignupResponses.push({
        status: response.status(),
        body,
      });
    }
  });

  await page.goto(PRACTICE_URL, { waitUntil: "networkidle" });

  await page.click('a:has-text("Начать слушать")');
  await page.waitForURL(/\/listen\//, { timeout: 20000 });

  const playButton = page
    .locator('button[aria-label="Воспроизвести"], button[aria-label="Пауза"]')
    .first();
  await playButton.waitFor({ state: "visible", timeout: 20000 });

  if ((await playButton.getAttribute("aria-label")) === "Воспроизвести") {
    await playButton.click();
  }

  await page.waitForTimeout(Number(process.env.PROMO_ZHENSKIE_INTERVAL_MS ?? "13000"));

  const guestProgress = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("audiolad_gp:")) {
        return { key, value: localStorage.getItem(key) };
      }
    }
    return null;
  });
  assert(guestProgress?.value, "guest progress saved");

  await page.evaluate(() => {
    const audio = document.querySelector("audio");
    if (!audio || !Number.isFinite(audio.duration)) {
      return;
    }
    audio.currentTime = Math.min(audio.duration * 0.4, audio.duration - 1);
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await page.waitForTimeout(2000);

  const cta = page.locator('button:has-text("Сохранить и получить подарки")');
  await cta.waitFor({ state: "visible", timeout: 15000 });
  await cta.click();

  const pending = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem("audiolad_promo_pending");
    return raw ? JSON.parse(raw) : null;
  });

  assert(pending?.practiceId, "pending practiceId");
  assert(pending?.practiceSlug === "zhenskie-dengi", "pending practiceSlug");
  assert(
    pending?.returnTo?.includes("/listen/zoya-petrova/zhenskie-dengi"),
    "pending returnTo",
  );
  assert(pending?.intent === "save_practice", "pending intent");

  await page.waitForURL(/\/auth\/sign-up/, { timeout: 15000 });

  await page.fill('input[placeholder="Ваше имя"]', "E2E");
  await page.fill('input[placeholder="Ваша фамилия"]', "Promo");
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/listen\/zoya-petrova\/zhenskie-dengi/, { timeout: 30000 });
  await page.waitForTimeout(8000);

  assert(completeSignupResponses.length >= 1, "complete-signup called");
  const first = completeSignupResponses[0];
  assert(first.status === 200 || first.status === 201, `complete-signup HTTP ${first.status}`);
  assert(first.body?.ok === true, "complete-signup ok");
  assert(first.body?.practiceSaved === true, "practiceSaved true");

  const pendingAfter = await page.evaluate(() =>
    window.sessionStorage.getItem("audiolad_promo_pending"),
  );
  assert(!pendingAfter, "pending context cleared after success");

  await page.goto("https://audiolad.ru/my-practices", { waitUntil: "networkidle" });
  const bodyText = await page.locator("body").innerText();

  for (const title of EXPECTED_PRACTICES) {
    assert(bodyText.includes(title), `library contains ${title}`);
  }

  for (const title of EXPECTED_PRACTICES) {
    const count = (bodyText.match(new RegExp(title, "g")) || []).length;
    assert(count === 1, `no duplicate for ${title}: count=${count}`);
  }

  await page.evaluate(async () => {
    await fetch("/api/promo/complete-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        practice_id: "0e0b4e85-4d16-4777-9acc-338151db081b",
        practice_slug: "zhenskie-dengi",
      }),
    });
  });
  await page.waitForTimeout(1000);

  await page.goto("https://audiolad.ru/my-practices", { waitUntil: "networkidle" });
  const bodyAfter = await page.locator("body").innerText();
  for (const title of EXPECTED_PRACTICES) {
    const count = (bodyAfter.match(new RegExp(title, "g")) || []).length;
    assert(count === 1, `after idempotent repeat: ${title} count=${count}`);
  }

  console.log("PROMO_ZHENSKIE_SIGNUP_E2E_PASS");
  console.log("TEST_EMAIL_MARKER", TEST_EMAIL.replace(/(.{3}).*(@.*)/, "$1***$2"));

  await browser.close();
}

main().catch((error) => {
  console.error("PROMO_ZHENSKIE_SIGNUP_E2E_FAIL", error.message);
  process.exit(1);
});
