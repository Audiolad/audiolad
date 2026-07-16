import "./lib/assert-playwright-allowed.mjs";
/**
 * Playlists PR3.3 — production UI smoke (called from production-smoke.sh).
 *
 * Env (required): SMOKE_EMAIL, SMOKE_PASS, SMOKE_PL_ID
 * Env (optional): SMOKE_EMPTY_ID, SMOKE_API
 *
 * Does not read secrets from disk. Credentials are disposable smoke fixtures
 * passed by the parent shell script and never logged.
 */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const email = process.env.SMOKE_EMAIL;
const pass = process.env.SMOKE_PASS;
const plId = process.env.SMOKE_PL_ID;
const emptyId = process.env.SMOKE_EMPTY_ID;
const api = process.env.SMOKE_API || "https://audiolad.ru";
const fix = join(dirname(fileURLToPath(import.meta.url)), "fixtures/playlist-covers");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  await page.goto(`${api}/auth/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  await page.goto(`${api}/playlists`, { waitUntil: "networkidle" });
  assert(
    (await page.locator(`a[href="/playlists/${plId}"]`).count()) > 0,
    "playlist card missing",
  );

  // empty playlist gradient path
  if (emptyId) {
    await page.goto(`${api}/playlists/${emptyId}`, { waitUntil: "networkidle" });
    const text = await page.locator("body").innerText();
    assert(/пусто|Аудиотек/i.test(text), "empty state");
  }

  await page.goto(`${api}/playlists/${plId}`, { waitUntil: "networkidle" });
  assert(
    (await page.getByRole("button", { name: /Изменить обложку/i }).count()) > 0,
    "edit cover button",
  );

  // open dialog, Escape, focus return
  const editBtn = page.getByRole("button", { name: /Изменить обложку/i });
  await editBtn.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert(await dialog.getAttribute("aria-modal") === "true", "aria-modal");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert((await dialog.count()) === 0 || !(await dialog.isVisible()), "escape closes");

  await editBtn.click();
  await dialog.waitFor({ state: "visible" });
  assert(/JPG, PNG или WebP, до 5 МБ/i.test(await dialog.innerText()), "limit hint");

  const jpg = join(fix, "landscape.jpg");
  await page.locator("#playlist-cover-file").setInputFiles(jpg);
  await page.waitForTimeout(400);
  await dialog.getByRole("button", { name: /^Сохранить$/i }).click();
  await page.waitForTimeout(2500);
  // custom cover should show; dialog closed
  assert(!(await dialog.isVisible().catch(() => false)), "dialog closed after save");

  // replace / return automatic
  await editBtn.click();
  await dialog.waitFor({ state: "visible" });
  const clear = page.getByRole("button", { name: /Вернуть автоматическую обложку/i });
  assert((await clear.count()) > 0, "clear action visible with custom");
  await clear.click();
  await page.waitForTimeout(2000);

  // mobile overflow
  for (const vp of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(vp);
    await page.goto(`${api}/playlists/${plId}`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    assert(overflow.sw <= overflow.cw + 1, `h-scroll ${JSON.stringify(vp)} ${JSON.stringify(overflow)}`);
  }

  console.log("PASS: PR3.3 playwright UI smoke");
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exit(1);
});
