#!/usr/bin/env node
/**
 * Real mobile pointer regression for analytics consent versus primary playback.
 *
 * Requires a running production-compatible app with the two public products
 * below. This intentionally uses coordinate touchscreen taps, never
 * element.click(), force clicks, synthetic DOM events, or direct player calls.
 *
 * Usage:
 *   AUDIT_BASE_URL=http://127.0.0.1:3000 \
 *     node scripts/analytics-consent-playback-hit-test.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = process.env.AUDIT_BASE_URL?.replace(/\/$/, "");

if (!BASE_URL) {
  throw new Error("AUDIT_BASE_URL is required");
}

const PRODUCTS = [
  {
    name: "Поток Изобилия",
    authorSlug: "sabarova-ol-ga",
    productSlug: "potok-izobiliya",
  },
  {
    name: "Настрой на изобилие",
    authorSlug: "natasa",
    productSlug: "nastroy-na-izobilie",
  },
];

const PLAYBACK_VIEWPORTS = [
  {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    isMobile: false,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
];

function center(box) {
  assert.ok(box, "visible element must have a bounding box");
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function nativeTap(page, locator) {
  await locator.waitFor({ state: "visible" });
  const point = center(await locator.boundingBox());
  await page.touchscreen.tap(point.x, point.y);
}

async function nativeActivate(page, locator, isMobile) {
  await locator.waitFor({ state: "visible" });
  const point = center(await locator.boundingBox());

  if (isMobile) {
    await page.touchscreen.tap(point.x, point.y);
    return;
  }

  await page.mouse.click(point.x, point.y);
}

async function readHitTarget(page, locator) {
  const point = center(await locator.boundingBox());

  return page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    const stack = document.elementsFromPoint(x, y).slice(0, 8).map((element) => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        id: element.id,
        className:
          typeof element.className === "string" ? element.className : "",
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
      };
    });

    return {
      targetTag: target?.tagName ?? null,
      targetIsPlaybackButton: target?.closest(
        "[data-practice-primary-play], [data-catalog-play-button]",
      ) !== null,
      stack,
    };
  }, point);
}

async function waitForActualPlayback(page) {
  await page.waitForFunction(() => {
    const audio = document.querySelector("audio.global-audio-element");
    return Boolean(audio && !audio.paused && audio.currentTime > 0);
  }, undefined, { timeout: 15_000 });
}

async function clearConsentAndReload(page) {
  await page.evaluate(() => {
    localStorage.removeItem("audiolad_analytics_cookies");
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function assertConsentControls(page) {
  const dialog = page.getByRole("dialog", {
    name: "Аналитические cookies",
  });
  const accept = dialog.getByRole("button", { name: "Разрешить" });
  const reject = dialog.getByRole("button", { name: "Отклонить" });
  const policy = dialog.getByRole("link", { name: "Подробнее в политике" });

  for (const control of [accept, reject, policy]) {
    const point = center(await control.boundingBox());
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element?.closest("button, a")?.textContent?.trim() ?? null;
    }, point);
    assert.ok(hit, "consent control must be its own hit target");
  }

  return { dialog, accept, reject, policy };
}

async function verifyConsentDecisions(browser) {
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await clearConsentAndReload(page);
    const { accept } = await assertConsentControls(page);
    await nativeTap(page, accept);
    await expectConsent(page, "granted");
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await clearConsentAndReload(page);
    const { reject } = await assertConsentControls(page);
    await nativeTap(page, reject);
    await expectConsent(page, "denied");
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await clearConsentAndReload(page);
    const { policy } = await assertConsentControls(page);
    await nativeTap(page, policy);
    await page.waitForURL(/\/privacy#section-8$/, { timeout: 10_000 });
    await context.close();
  }
}

async function expectConsent(page, expected) {
  await page.waitForFunction(
    (expectedConsent) =>
      localStorage.getItem("audiolad_analytics_cookies") === expectedConsent,
    expected,
  );
  await assert.rejects(
    page.getByRole("dialog", { name: "Аналитические cookies" }).waitFor({
      state: "visible",
      timeout: 500,
    }),
  );
}

async function verifySurface(browser, product, surface, viewport) {
  const context = await browser.newContext({
    viewport: viewport.viewport,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  const page = await context.newPage();
  const url =
    surface === "pdp"
      ? `${BASE_URL}/practice/${product.authorSlug}/${product.productSlug}`
      : `${BASE_URL}/catalog?q=${encodeURIComponent(product.name)}`;

  await page.goto(url, { waitUntil: "networkidle" });
  await clearConsentAndReload(page);

  const button =
    surface === "pdp"
      ? page.locator("[data-practice-primary-play]")
      : page
          .locator("[data-catalog-grid-card]")
          .filter({ hasText: product.name })
          .locator("[data-catalog-play-button]");
  await button.waitFor({ state: "visible" });

  const hit = await readHitTarget(page, button);
  assert.equal(
    hit.targetIsPlaybackButton,
    true,
    `${surface} ${product.name}: unknown-consent dialog must not cover playback CTA; stack=${JSON.stringify(hit.stack)}`,
  );

  await nativeActivate(page, button, viewport.isMobile);
  await waitForActualPlayback(page);
  assert.equal(
    await button.getAttribute("aria-label"),
    "Пауза",
    `${surface} ${product.name}: active CTA must announce pause`,
  );

  if (surface === "pdp") {
    assert.match(
      (await button.textContent()) ?? "",
      /Пауза/,
      `${product.name}: PDP CTA must visibly show pause while playing`,
    );
  }

  await nativeActivate(page, button, viewport.isMobile);
  await page.waitForFunction(() => {
    const audio = document.querySelector("audio.global-audio-element");
    return Boolean(audio?.paused);
  }, undefined, { timeout: 5_000 });
  assert.notEqual(
    await button.getAttribute("aria-label"),
    "Пауза",
    `${surface} ${product.name}: paused CTA must return to play state`,
  );
  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    "/usr/local/bin/google-chrome",
});

try {
  await verifyConsentDecisions(browser);

  for (const product of PRODUCTS) {
    for (const viewport of PLAYBACK_VIEWPORTS) {
      await verifySurface(browser, product, "pdp", viewport);
      await verifySurface(browser, product, "catalog", viewport);
    }
  }
} finally {
  await browser.close();
}

console.log("analytics-consent-playback-hit-test: ok");
