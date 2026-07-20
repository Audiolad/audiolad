#!/usr/bin/env node
/**
 * Visual smoke for promo pages block on author promotion page.
 * Static HTML mock — does not mutate production data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT_DIR = path.join(
  process.cwd(),
  "scripts/screenshots/author-promotion-promo-pages",
);

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { font-family: system-ui, sans-serif; background: #f7f2fc; color: #25135c; }</style>
</head>
<body class="p-4 sm:p-8">
  <div class="mx-auto max-w-3xl space-y-8">
    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-[21px] font-semibold">Кампании</h2>
        <button type="button" class="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">Создать кампанию</button>
      </div>
      <button type="button" class="w-full rounded-[22px] border border-[#9a74d8] bg-[#f4ecfb] px-4 py-4 text-left">
        <p class="text-[17px] font-semibold">Женские деньги — ботхелп</p>
        <p class="mt-1 text-sm text-[#7d70a2]">Женские деньги · zhenskie_dengi_bothelp</p>
      </button>
    </section>

    <section class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-[21px] font-semibold">Промостраницы</h2>
          <p class="mt-1 text-sm text-[#7d70a2]">Создавайте посадочные страницы с одной, двумя или тремя практиками.</p>
        </div>
        <button type="button" class="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">Создать промостраницу</button>
      </div>

      <article class="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-[17px] font-semibold">3 квантмедитации — BotHelp</p>
            <p class="mt-1 truncate text-sm text-[#7d70a2]">Внутреннее название для команды</p>
            <p class="mt-1 break-all text-sm text-[#7d70a2]">/promo/sergey-and-zoya/3-kvantmeditatsii-bothelp</p>
          </div>
          <span class="inline-flex shrink-0 rounded-full bg-[#fff4df] px-2.5 py-1 text-[11px] font-medium text-[#b67a1d]">Черновик</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-4 text-sm text-[#5f5484]">
          <span>Продукты: 2</span>
          <span class="truncate">Slug: 3-kvantmeditatsii-bothelp</span>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]">Предпросмотр</button>
          <button class="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]">Редактировать</button>
          <button class="rounded-full bg-[#7042c5] px-3 py-1.5 text-xs font-semibold text-white">Опубликовать</button>
        </div>
      </article>

      <article class="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-[17px] font-semibold">Изобилие — landing MAX</p>
            <p class="mt-1 break-all text-sm text-[#7d70a2]">/promo/sergey-and-zoya/izobilie-max-landing-with-very-long-slug-that-should-wrap-instead-of-overflowing</p>
          </div>
          <span class="inline-flex shrink-0 rounded-full bg-[#eaf7ef] px-2.5 py-1 text-[11px] font-medium text-[#3d8d65]">Опубликована</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-4 text-sm text-[#5f5484]">
          <span>Продукты: 1</span>
          <span class="truncate">Slug: izobilie-max-landing-with-very-long-slug-that-should-wrap-instead-of-overflowing</span>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]">Предпросмотр</button>
          <button class="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]">Снять с публикации</button>
          <button class="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]">Скопировать ссылку</button>
        </div>
      </article>
    </section>

    <section class="space-y-4">
      <h2 class="text-[21px] font-semibold">Ссылки для публикации</h2>
      <div class="rounded-[20px] border border-[#eadff8] bg-white px-4 py-3 text-sm text-[#7d70a2]">UTM-ссылки выбранной кампании остаются ниже блока промостраниц.</div>
    </section>
  </div>
</body>
</html>`;

async function capture(page, viewport, filename) {
  await page.setViewportSize(viewport);
  await page.screenshot({
    path: path.join(OUT_DIR, filename),
    fullPage: true,
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, "fixture.html");
  writeFileSync(htmlPath, FIXTURE_HTML, "utf8");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

  await capture(page, { width: 1440, height: 900 }, "desktop-1440-promo-pages-block.png");
  await capture(page, { width: 390, height: 844 }, "mobile-390-promo-pages-block.png");
  await capture(page, { width: 320, height: 568 }, "mobile-320-promo-pages-block.png");

  await browser.close();
  console.log(`author-promotion-promo-pages-visual: ok (${OUT_DIR})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
