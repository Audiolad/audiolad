#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

const VIEWPORTS = [320, 375, 390, 430];

const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --bottom-nav-main-height: 68px;
        --bottom-nav-content-gap: 28px;
        --platform-bottom-content-padding: calc(
          var(--bottom-nav-main-height) + var(--bottom-nav-content-gap)
        );
      }
      body {
        margin: 0;
        background: #f7f2fc;
        color: #25135c;
        font-family: system-ui, sans-serif;
      }
      .shell { padding: 1.5rem 1.25rem 1rem; }
      article { margin: 0 auto; width: 100%; max-width: 720px; padding-bottom: var(--platform-bottom-content-padding); }
      .hero { aspect-ratio: 4 / 5; width: 100%; border-radius: 28px; background: #efe6fb; }
      h1 { margin: 1.25rem 0 0; font-size: 26px; line-height: 1.2; }
      .copy { margin: 1rem 0 0; font-size: 15px; line-height: 1.5; color: #5f5484; }
      .cta { margin-top: 1.5rem; }
      .price { font-size: 36px; font-weight: 600; line-height: 1; }
      .buy {
        display: flex; min-height: 48px; width: 100%; align-items: center; justify-content: center;
        border: 0; border-radius: 22px; background: #7042c5; color: #fff; font-size: 17px; font-weight: 600;
      }
      .catalog-product-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        list-style: none;
        padding: 0;
        margin: 2rem 0 0;
      }
      .catalog-product-grid--fixed-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (min-width: 768px) {
        .catalog-product-grid,
        .catalog-product-grid--fixed-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
      }
      @media (min-width: 1280px) {
        .catalog-product-grid--fixed-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      li { min-width: 0; }
      .cover { aspect-ratio: 1 / 1; width: 100%; border-radius: 18px; background: #efe6fb; }
      .title { margin: 0.5rem 0 0; font-size: 14px; font-weight: 600; line-height: 1.25; }
      .desc { margin: 0.25rem 0 0; font-size: 13px; line-height: 1.25; color: #5f5484; }
    </style>
  </head>
  <body>
    <div class="shell">
      <article data-meditation-solutions-landing>
        <div class="hero"></div>
        <h1>25 готовых решений для создания своих медитаций</h1>
        <p class="copy">Как создать свою медитацию с нуля: выбрать тему, написать текст для медитации, записать медитацию самостоятельно, добавить музыку и получить готовый MP3.</p>
        <p class="copy">25 готовых тем, текстов, шаблонов, инструкций и практических инструментов – от первой идеи до готовой медитации с голосом и музыкой.</p>
        <div class="cta" data-meditation-solutions-cta="top">
          <p class="price">499 ₽</p>
          <p>Предложение действует ещё:</p>
          <p>20:00 мин.</p>
          <button class="buy" type="button">Купить</button>
        </div>
        <ul data-catalog-product-grid data-meditation-solutions-grid class="catalog-product-grid catalog-product-grid--fixed-2">
          ${Array.from({ length: 26 }, (_, index) => `
            <li>
              <article>
                <div class="cover"></div>
                <h2 class="title">Карточка ${index + 1} с достаточно длинным названием</h2>
                <p class="desc">Короткое описание, которое должно переноситься без горизонтального скролла.</p>
              </article>
            </li>
          `).join("")}
        </ul>
        <div class="cta" data-meditation-solutions-cta="bottom">
          <p class="price">499 ₽</p>
          <p>Предложение действует ещё:</p>
          <p>20:00 мин.</p>
          <button class="buy" type="button">Купить</button>
        </div>
      </article>
    </div>
    <nav style="position:fixed;left:0;right:0;bottom:0;height:68px;background:#fff;"></nav>
  </body>
</html>`;

const dir = mkdtempSync(join(tmpdir(), "meditation-solutions-landing-"));
const file = join(dir, "landing.html");
writeFileSync(file, html);

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});

try {
  for (const width of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
    });
    await page.goto(`file://${file}`);

    const metrics = await page.evaluate(() => {
      const article = document.querySelector("[data-meditation-solutions-landing]");
      const grid = document.querySelector("[data-meditation-solutions-grid]");
      const cards = [...grid.querySelectorAll(":scope > li")];
      const first = cards[0].getBoundingClientRect();
      const second = cards[1].getBoundingClientRect();
      const third = cards[2].getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        articleWidth: article.getBoundingClientRect().width,
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        firstTop: Math.round(first.top),
        secondTop: Math.round(second.top),
        thirdTop: Math.round(third.top),
        cardCount: cards.length,
        buyHeight: document.querySelector(".buy").getBoundingClientRect().height,
      };
    });

    assert.equal(metrics.cardCount, 26, `${width}px: 26 cards`);
    assert.equal(metrics.columns, 2, `${width}px: exactly 2 columns`);
    assert.equal(
      metrics.firstTop,
      metrics.secondTop,
      `${width}px: first row shares the same top`,
    );
    assert.ok(
      metrics.thirdTop > metrics.firstTop,
      `${width}px: third card wraps to the next row`,
    );
    assert.ok(
      metrics.scrollWidth <= metrics.clientWidth + 1,
      `${width}px: no horizontal overflow (${metrics.scrollWidth} > ${metrics.clientWidth})`,
    );
    assert.ok(
      metrics.articleWidth <= width,
      `${width}px: article stays inside the viewport`,
    );
    assert.ok(metrics.buyHeight >= 48, `${width}px: Купить tap target`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log("meditation-solutions-landing-responsive-unit: ok");
