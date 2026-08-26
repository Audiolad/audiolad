#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

const VIEWPORTS = [320, 375, 390, 430, 1280];

const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        background: #f7f2fc;
        color: #25135c;
        font-family: system-ui, sans-serif;
      }
      [data-meditation-solutions-shell] {
        min-height: 100dvh;
        background: #f7f2fc;
      }
      article {
        margin: 0 auto;
        width: 100%;
        max-width: 560px;
        padding: 2rem 1.5rem 4rem;
        box-sizing: border-box;
      }
      .hero-card {
        border: 1px solid #e8def5;
        border-radius: 28px;
        background: #fff;
        padding: 14px;
        max-width: 300px;
        margin: 0 auto;
      }
      .hero-cover {
        aspect-ratio: 1 / 1;
        width: 100%;
        margin: 0 auto;
        border-radius: 22px;
        background: #efe6fb;
        object-fit: contain;
      }
      .hero-title { padding: 2.5rem 4px 4px; }
      h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.25;
        text-align: center;
      }
      .copy { margin: 2rem 0 0; font-size: 15px; line-height: 1.5; color: #5f5484; }
      .cta { margin-top: 2rem; }
      .price { font-size: 36px; font-weight: 600; line-height: 1; }
      .buy {
        display: flex; min-height: 48px; width: 100%; align-items: center; justify-content: center;
        border: 0; border-radius: 22px; background: #7042c5; color: #fff; font-size: 17px; font-weight: 600;
      }
      .catalog-product-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.875rem;
        list-style: none;
        padding: 0;
        margin: 3rem 0 0;
      }
      .catalog-product-grid--fixed-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (min-width: 768px) {
        .hero-card { max-width: 340px; }
        .catalog-product-grid,
        .catalog-product-grid--fixed-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.125rem; }
      }
      @media (min-width: 1280px) {
        .catalog-product-grid--fixed-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      li { min-width: 0; }
      .cover { aspect-ratio: 1 / 1; width: 100%; border-radius: 18px; background: #efe6fb; }
      .title { margin: 0.5rem 0 0; font-size: 13px; font-weight: 600; line-height: 1.35; }
    </style>
  </head>
  <body>
    <div data-meditation-solutions-shell>
      <article data-meditation-solutions-landing>
        <div data-meditation-solutions-hero-card class="hero-card">
          <div data-meditation-solutions-hero-cover class="hero-cover"></div>
          <div data-meditation-solutions-hero-title class="hero-title">
            <h1>25 готовых решений для создания своих медитаций</h1>
          </div>
        </div>
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
                <h2 class="title">${index === 25 ? "Бонус. " : `${index + 1}. `}Карточка ${index + 1} с достаточно длинным названием</h2>
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
      const shell = document.querySelector("[data-meditation-solutions-shell]");
      const article = document.querySelector("[data-meditation-solutions-landing]");
      const heroCard = document.querySelector("[data-meditation-solutions-hero-card]");
      const heroCover = document.querySelector("[data-meditation-solutions-hero-cover]");
      const heroTitle = document.querySelector("[data-meditation-solutions-hero-title]");
      const heading = heroTitle.querySelector("h1");
      const grid = document.querySelector("[data-meditation-solutions-grid]");
      const cards = [...grid.querySelectorAll(":scope > li")];
      const first = cards[0].getBoundingClientRect();
      const second = cards[1].getBoundingClientRect();
      const third = cards[2].getBoundingClientRect();
      const coverBox = heroCover.getBoundingClientRect();
      const titleBox = heading.getBoundingClientRect();
      const style = getComputedStyle(heading);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        articleWidth: article.getBoundingClientRect().width,
        heroCardWidth: heroCard.getBoundingClientRect().width,
        coverWidth: coverBox.width,
        coverHeight: coverBox.height,
        coverSquare: Math.abs(coverBox.width - coverBox.height) <= 1,
        coverTitleGap: titleBox.top - coverBox.bottom,
        headingAlign: style.textAlign,
        headingInsideCard: heroCard.contains(heading),
        hasListenerShell: Boolean(
          document.querySelector(".listener-app-shell") ||
            document.querySelector("[data-listener-sidebar]") ||
            document.querySelector("[class*='listener-app-shell__sidebar']"),
        ),
        hasDedicatedShell: Boolean(shell),
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        firstTop: Math.round(first.top),
        secondTop: Math.round(second.top),
        thirdTop: Math.round(third.top),
        cardCount: cards.length,
        firstTitle: cards[0].querySelector("h2").textContent.trim(),
        lastTitle: cards[25].querySelector("h2").textContent.trim(),
        buyHeight: document.querySelector(".buy").getBoundingClientRect().height,
      };
    });

    assert.equal(metrics.hasDedicatedShell, true, `${width}px: dedicated landing shell`);
    assert.equal(metrics.hasListenerShell, false, `${width}px: no ListenerAppShell`);
    assert.equal(metrics.headingInsideCard, true, `${width}px: H1 in hero card`);
    assert.equal(metrics.headingAlign, "center", `${width}px: H1 centered`);
    assert.ok(metrics.coverTitleGap >= 36, `${width}px: extra gap under cover`);
    assert.equal(metrics.coverSquare, true, `${width}px: hero cover is square`);
    assert.ok(
      metrics.coverWidth <= metrics.heroCardWidth,
      `${width}px: hero cover stays inside the card`,
    );
    assert.ok(
      metrics.coverWidth <= 341,
      `${width}px: hero cover stays compact (${metrics.coverWidth})`,
    );
    assert.ok(
      metrics.articleWidth <= Math.min(width, 560),
      `${width}px: article stays within the 560px canvas`,
    );
    assert.equal(metrics.cardCount, 26, `${width}px: 26 cards`);
    assert.equal(metrics.columns, 2, `${width}px: exactly 2 columns`);
    assert.match(metrics.firstTitle, /^1\./, `${width}px: first title numbered`);
    assert.match(metrics.lastTitle, /^Бонус\./, `${width}px: bonus title prefix`);
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
