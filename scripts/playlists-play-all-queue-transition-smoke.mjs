import "./lib/assert-playwright-allowed.mjs";
/**
 * Real queue transition smoke (Playwright).
 * Requires env: API, EMAIL, PASS, OWNER_PL, PUBLIC_SLUG
 * Optional: PRODUCT_A_SLUG path segments via first listen URL.
 *
 * Confirms practiceId/URL change after real audio `ended` (seek near end).
 */
import { chromium } from "playwright";

const api = process.env.API || "https://audiolad.ru";
const email = process.env.EMAIL;
const pass = process.env.PASS;
const ownerPl = process.env.OWNER_PL;
const publicSlug = process.env.PUBLIC_SLUG;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForAudioReady(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio.global-audio-element, audio");
      return Boolean(
        audio &&
          audio.src &&
          Number.isFinite(audio.duration) &&
          audio.duration > 0,
      );
    },
    null,
    { timeout },
  );
}

async function seekNearEndAndWaitEnded(page) {
  await waitForAudioReady(page);
  await page.evaluate(async () => {
    const audio = document.querySelector("audio.global-audio-element, audio");
    if (!audio) throw new Error("no audio");

    const ended = new Promise((resolve) => {
      audio.addEventListener("ended", () => resolve(true), { once: true });
    });

    try {
      await audio.play();
    } catch {
      /* continue — seek may still complete under autoplay policy */
    }

    audio.currentTime = Math.max(0, audio.duration - 0.2);

    try {
      await audio.play();
    } catch {
      /* ignore */
    }

    await Promise.race([
      ended,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("audio ended not fired")), 12000),
      ),
    ]);
  });
}

async function listenPath(page) {
  return new URL(page.url()).pathname;
}

async function practiceIdFromSessionHint(page) {
  return page.evaluate(() => {
    const audio = document.querySelector("audio.global-audio-element, audio");
    return {
      src: audio?.src || "",
      paused: Boolean(audio?.paused),
      currentTime: audio?.currentTime || 0,
      path: location.pathname,
    };
  });
}

async function clickPlayAll(page) {
  await page.getByRole("button", { name: "Слушать всё" }).click({ timeout: 15000 });
  await page.waitForURL(/\/listen\//, { timeout: 25000 });
}

async function advanceByEnded(page, previousPath) {
  await seekNearEndAndWaitEnded(page);
  await page.waitForFunction(
    (prev) => location.pathname !== prev && location.pathname.includes("/listen/"),
    previousPath,
    { timeout: 45000 },
  );
  await page.waitForTimeout(800);
  await waitForAudioReady(page).catch(() => {});
}

async function measureCompactRows(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll(".playlist-item-row")];
    const heights = rows.slice(0, 20).map((el) => el.getBoundingClientRect().height);
    const scroll = {
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
    return {
      count: rows.length,
      heights,
      maxHeight: heights.length ? Math.max(...heights) : 0,
      minHeight: heights.length ? Math.min(...heights) : 0,
      horizontalOverflow: scroll.sw > scroll.cw + 2,
    };
  });
}

(async () => {
  assert(email && pass && ownerPl && publicSlug, "missing env");

  const browser = await chromium.launch({ headless: true });

  // --- Owner: Play All → ended A → B → C (or completion) + Next/Previous ---
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`${api}/auth/sign-in`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', pass);
    await Promise.all([
      page
        .waitForURL((u) => !u.pathname.includes("/auth/sign-in"), {
          timeout: 20000,
        })
        .catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(600);

    await page.goto(`${api}/playlists/${ownerPl}`, {
      waitUntil: "domcontentloaded",
    });

    const compact = await measureCompactRows(page);
    assert(compact.count >= 2, `expected compact rows, got ${compact.count}`);
    assert(
      compact.maxHeight <= 92 && compact.minHeight >= 70,
      `row height out of range: min=${compact.minHeight} max=${compact.maxHeight}`,
    );
    assert(!compact.horizontalOverflow, "horizontal scroll on owner playlist");
    console.log("COMPACT_OWNER_OK", compact.count, compact.minHeight, compact.maxHeight);

    await clickPlayAll(page);
    const pathA = await listenPath(page);
    console.log("OWNER_A", pathA);
    await waitForAudioReady(page);

    // Real ended A → B (primary iPhone bug)
    await advanceByEnded(page, pathA);
    const pathB = await listenPath(page);
    assert(pathB !== pathA, "ended did not advance product");
    assert(pathB.includes("/listen/"), "ended landed on listen");
    console.log("OWNER_ENDED_A_TO_B", pathB);
    const after = await practiceIdFromSessionHint(page);
    assert(after.src.length > 0, "next product audio src set");
    await waitForAudioReady(page);

    // Real ended B → C or completion
    await seekNearEndAndWaitEnded(page);
    await Promise.race([
      page.waitForFunction(
        (prev) =>
          location.pathname !== prev ||
          document.body.innerText.includes("Плейлист прослушан"),
        pathB,
        { timeout: 45000 },
      ),
      page
        .getByText("Плейлист прослушан")
        .waitFor({ timeout: 45000 })
        .then(() => "completion"),
    ]);
    const body = await page.locator("body").innerText();
    const pathAfterSecond = await listenPath(page);
    const completedEarly = body.includes("Плейлист прослушан");
    assert(
      completedEarly || pathAfterSecond !== pathB,
      "second ended neither advanced nor completed",
    );
    console.log(
      completedEarly ? "OWNER_COMPLETION_OK" : "OWNER_ENDED_B_TO_NEXT",
      pathAfterSecond,
    );

    if (!completedEarly) {
      await waitForAudioReady(page);

      // Manual Previous → prior product track 0
      const prevBtn = page
        .getByRole("button", {
          name: /Предыдущее аудио|В начало текущего аудио/i,
        })
        .first();
      await page.waitForFunction(
        () => {
          const btn = [...document.querySelectorAll("button")].find((el) => {
            const label = el.getAttribute("aria-label") || "";
            return /Предыдущее аудио|В начало текущего аудио/i.test(label);
          });
          return Boolean(btn && !btn.disabled);
        },
        null,
        { timeout: 20000 },
      );
      const pathBeforePrev = await listenPath(page);
      await prevBtn.click();
      await page.waitForFunction(
        (prev) => location.pathname !== prev,
        pathBeforePrev,
        { timeout: 25000 },
      );
      console.log("OWNER_PREV_OK", await listenPath(page));
      await waitForAudioReady(page);

      // Manual Next forward again
      const nextBtn = page.getByRole("button", { name: /Следующ/i }).first();
      const pathBeforeNext = await listenPath(page);
      await nextBtn.click();
      await page.waitForFunction(
        (prev) => location.pathname !== prev,
        pathBeforeNext,
        { timeout: 25000 },
      );
      console.log("OWNER_NEXT_OK", await listenPath(page));
    }

    // Standalone clears queue: open unrelated listen if possible via catalog
    // Soft check — navigate home then a listen URL different from queue path.
    await page.goto(`${api}/catalog`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    await context.close();
  }

  // --- Public guest: Play All + ended transition + compact ---
  {
    const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
    });
    const page = await context.newPage();
    await page.goto(`${api}/p/${publicSlug}`, {
      waitUntil: "domcontentloaded",
    });
    const compact = await measureCompactRows(page);
    assert(compact.count >= 2, "public compact rows");
    assert(compact.maxHeight <= 92, "public row too tall");
    console.log("COMPACT_PUBLIC_OK", compact.count);

    await clickPlayAll(page);
    const pathA = await listenPath(page);
    await waitForAudioReady(page);
    await advanceByEnded(page, pathA);
    const pathB = await listenPath(page);
    assert(pathB !== pathA, "public ended did not advance");
    console.log("PUBLIC_ENDED_OK", pathA, "→", pathB);
    await context.close();
  }

  // Desktop compact
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(`${api}/p/${publicSlug}`, {
      waitUntil: "domcontentloaded",
    });
    const compact = await measureCompactRows(page);
    assert(compact.count >= 2, "desktop rows");
    assert(!compact.horizontalOverflow, "desktop horizontal scroll");
    console.log("COMPACT_DESKTOP_OK", compact.count);
    await context.close();
  }

  await browser.close();
  console.log("PLAY_ALL_QUEUE_TRANSITION_SMOKE_PASS");
})().catch((e) => {
  console.error("QUEUE_TRANSITION_FAIL", e.message || e);
  process.exit(1);
});
