const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const appOrigin = 'https://audiolad.ru';
const timeline = 'section[aria-label="Временная шкала Studio"] > div';

async function main() {
  assert.equal(process.platform, 'win32');
  const mp3 = 'studio-scroll-test.mp3';
  execFileSync(require('ffmpeg-static'), [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', 'sine=frequency=220:sample_rate=22050', '-t', '960', '-b:a', '24k', mp3,
  ]);
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
    page.setDefaultTimeout(30000);
    const button = (name) => page.getByRole('button', { name, exact: true }).first();
    console.log(JSON.stringify({ windows: process.platform, chrome: browser.version() }));
    await page.goto(`${appOrigin}/studio/try`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/^https:\/\/audiolad\.ru\/studio\/project\/[a-f0-9-]{36}$/i);
    await page.locator(timeline).waitFor();
    if (await button('Отклонить').isVisible()) await button('Отклонить').click();
    await button('+ Голос').click();
    await button('+ Музыка').click();

    async function addTrack(kind, expectedSaved) {
      if (kind === 'music') await button('Добавить музыку').click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        button(kind === 'music' ? 'С устройства' : 'Загрузить голос').click(),
      ]);
      await chooser.setFiles(mp3);
      await page.getByText('Аудио сохранено', { exact: true }).nth(expectedSaved - 1).waitFor({ timeout: 75000 });
    }
    for (const [i, kind] of ['voice', 'voice', 'music', 'music'].entries()) {
      await addTrack(kind, i + 1);
    }
    assert.equal(await page.getByText('Аудио сохранено', { exact: true }).count(), 4);

    const transport = page.getByRole('region', { name: 'Транспорт Studio' });
    await button('Перемотать вперёд на 15 секунд').click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Транспорт Studio"]').textContent.includes('0:15'));
    await button('Перемотать вперёд на 15 секунд').click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Транспорт Studio"]').textContent.includes('0:30'));
    await button('Воспроизвести').click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Транспорт Studio"]').textContent.includes('0:36'));
    await button('Пауза').click();
    console.log('Paused transport:', await transport.innerText());
    for (let i = 0; i < 5; i++) await button('Уменьшить масштаб временной шкалы').click();

    const viewport = page.locator(timeline);
    await button('+ Музыка').evaluate(element => element.scrollIntoView({ block: 'end' }));
    await viewport.evaluate(element => {
      const prototype = Element.prototype;
      const original = Object.getOwnPropertyDescriptor(prototype, 'scrollLeft');
      const writes = [];
      const sizes = [];
      let events = 0;
      let pointerUps = 0;
      Object.defineProperty(prototype, 'scrollLeft', {
        ...original,
        set(requested) {
          if (this !== element) return original.set.call(this, requested);
          const before = original.get.call(this);
          original.set.call(this, requested);
          writes.push({ before, requested, after: original.get.call(this), stack: new Error().stack });
        },
      });
      element.addEventListener('scroll', () => events++);
      window.addEventListener('pointerup', () => pointerUps++, true);
      new ResizeObserver(() => sizes.push({ client: element.clientWidth, scroll: element.scrollWidth })).observe(element);
      window.scrollProbe = {
        start() {
          original.set.call(element, 0);
          events = 0;
          pointerUps = 0;
          writes.length = 0;
          sizes.length = 0;
        },
        read: () => ({ left: element.scrollLeft, client: element.clientWidth, scroll: element.scrollWidth }),
        finish: () => ({ writes, sizes, events, pointerUps }),
      };
    });

    for (const gesture of ['track-hold', 'thumb-drag']) {
      await page.evaluate(() => window.scrollProbe.start());
      const geometry = await viewport.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left, bottom: rect.bottom, width: rect.width, gutter: element.offsetHeight - element.clientHeight };
      });
      assert.ok(geometry.gutter >= 8, `Expected a visible native scrollbar: ${JSON.stringify(geometry)}`);
      const y = Math.floor(geometry.bottom - geometry.gutter / 2);
      await page.mouse.move(geometry.x + (gesture === 'track-hold' ? 240 : 24), y);
      await page.mouse.down();
      if (gesture === 'thumb-drag') {
        await page.mouse.move(geometry.x + 240, y, { steps: 15 });
      } else {
        await page.waitForTimeout(850);
      }
      const beforeUp = await page.evaluate(() => window.scrollProbe.read());
      await page.mouse.up();
      const immediate = await page.evaluate(() => window.scrollProbe.read());
      const nextFrame = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(window.scrollProbe.read()))));
      await page.waitForTimeout(1500);
      const settled = await page.evaluate(() => window.scrollProbe.read());
      const trace = await page.evaluate(() => window.scrollProbe.finish());
      const moved = beforeUp.left > 2;
      const reset = moved && [immediate, nextFrame, settled].some(sample => sample.left < 2);
      console.log(JSON.stringify({ gesture, geometry, beforeUp, immediate, nextFrame, settled, moved, reset, trace }));
      if (!moved) process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.message.replace(/\/studio\/project\/[a-f0-9-]{36}/gi, '/studio/project/[guest]'));
  process.exitCode = 1;
});
