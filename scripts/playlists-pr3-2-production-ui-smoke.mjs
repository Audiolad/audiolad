/**
 * Playlists PR3.2 production UI smoke (called from bash wrapper).
 * Env: SMOKE_EMAIL, SMOKE_PASS, SMOKE_PL_ID, SMOKE_API
 */
import { chromium } from "playwright";

const email = process.env.SMOKE_EMAIL;
const pass = process.env.SMOKE_PASS;
const plId = process.env.SMOKE_PL_ID;
const api = process.env.SMOKE_API || "https://audiolad.ru";

if (!email || !pass || !plId) {
  console.error("Missing SMOKE_EMAIL / SMOKE_PASS / SMOKE_PL_ID");
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
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
  const cardLink = page.locator(`a[href="/playlists/${plId}"]`).first();
  assert((await cardLink.count()) > 0, "playlist card link missing on /playlists");

  const urlBefore = page.url();
  const rowMenu = page.getByRole("button", {
    name: new RegExp(`Меню плейлиста`, "i"),
  }).first();
  if ((await rowMenu.count()) > 0) {
    await rowMenu.click();
    await page.waitForTimeout(300);
    assert(
      !page.url().includes(`/playlists/${plId}`),
      "··· menu navigated to detail",
    );
    assert(
      page.url() === urlBefore || page.url().includes("/playlists"),
      "unexpected navigation from menu",
    );
    await page.keyboard.press("Escape");
  }

  await cardLink.click();
  await page.waitForURL(`**/playlists/${plId}`, { timeout: 15000 });
  const body = await page.locator("body").innerText();
  assert(body.includes("PR3.2 Smoke Detail"), "detail title missing");
  assert(
    (await page.getByRole("link", { name: /Слушать/i }).count()) >= 1,
    "expected at least one Listen link",
  );

  const back = page.getByRole("link", { name: /Назад|Плейлисты/i }).first();
  if ((await back.count()) > 0) {
    await back.click();
    await page.waitForURL("**/playlists", { timeout: 10000 });
  }

  const res = await page.goto(
    `${api}/playlists/00000000-0000-4000-8000-000000000099`,
    { waitUntil: "domcontentloaded" },
  );
  const status = res?.status() ?? 0;
  const notFoundText = await page.locator("body").innerText();
  assert(
    status === 404 || /не найден|not found|404/i.test(notFoundText),
    `foreign uuid expected 404, got ${status}`,
  );

  const res2 = await page.goto(`${api}/playlists/not-a-uuid`, {
    waitUntil: "domcontentloaded",
  });
  const status2 = res2?.status() ?? 0;
  const t2 = await page.locator("body").innerText();
  assert(
    status2 === 404 || /не найден|not found|404/i.test(t2),
    `invalid uuid expected 404, got ${status2}`,
  );

  await page.goto(`${api}/playlists/${plId}`, { waitUntil: "networkidle" });
  let overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `horizontal scroll at 390: ${JSON.stringify(overflow)}`,
  );

  await page.setViewportSize({ width: 430, height: 932 });
  await page.reload({ waitUntil: "networkidle" });
  overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `horizontal scroll at 430: ${JSON.stringify(overflow)}`,
  );

  // Delete one item via UI
  const more = page.getByRole("button", { name: /Ещё|меню|More/i }).first();
  const dots = page.locator("button").filter({ hasText: "···" }).first();
  const menuTrigger = (await dots.count()) > 0 ? dots : more;
  if ((await menuTrigger.count()) > 0) {
    await menuTrigger.click();
    const remove = page.getByRole("menuitem", { name: /Удалить/i }).or(
      page.getByRole("button", { name: /Удалить из плейлиста|Удалить/i }),
    );
    await remove.first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Удалить$/i }).click();
    await page.waitForTimeout(1500);
  }

  console.log("PASS: playwright UI smoke");
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exit(1);
});
