import './lib/assert-playwright-allowed.mjs';
import assert from 'node:assert/strict';

// Read-only against an explicitly configured local catalogue. No fixture/DB writes.
const base = new URL(process.env.ALBUM_RADIO_TEST_BASE ?? 'http://127.0.0.1:3000');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Local test server required');
const path = process.env.ALBUM_RADIO_TEST_LISTEN_PATH;
assert.match(path ?? '', /^\/listen\/[^/?]+\/[^/?]+$/, 'Set ALBUM_RADIO_TEST_LISTEN_PATH to a free music album in the local test DB');
const { chromium, webkit } = await import('playwright');
for (const [name, launcher, viewport] of [['desktop', chromium, { width: 1440, height: 960 }],
  ['mobile-webkit', webkit, { width: 390, height: 844 }]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('album-radio-test-initialized')) return;
      sessionStorage.setItem('album-radio-test-initialized', '1');
      localStorage.setItem('audiolad:album-radio-enabled', '1');
      localStorage.setItem('audiolad:player-repeat-mode', 'off');
    });
    await page.goto(new URL(`${path}?autoplay=1`, base).href);
    const audio = page.locator('audio').first();
    await audio.waitFor();
    await audio.evaluate((element) => { element.dataset.radioIdentity = 'persistent'; });
    const firstTrackId = await page.evaluate(async () => {
      const parts = location.pathname.split('/');
      const response = await fetch('/api/listen/album-radio', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: parts[2], slug: parts[3], exclude: [] }) });
      const result = await response.json();
      if (!result.entries?.length) throw Error('Local catalogue needs at least one accessible similar track by another artist');
      return result.trackIds.at(-1);
    });
    assert.ok(firstTrackId);
    // A gesture unlocks WebKit. Actual media time must advance before seeking.
    const play = page.getByRole('button', { name: 'Воспроизвести', exact: true }).and(page.locator(':visible'));
    if (await play.count()) await play.first().click();
    await page.waitForFunction(() => [...document.querySelectorAll('audio')].some((a) => !a.paused && a.currentTime > 0.15));
    let source = await audio.getAttribute('src');
    // Finish each source track via real HTMLMediaElement ended, never dispatch a fake event.
    for (let count = 0; count < 100; count++) {
      if (await page.getByText('Радио по альбому', { exact: true }).and(page.locator(':visible')).first().isVisible().catch(() => false)) break;
      await page.waitForFunction(() => Number.isFinite(document.querySelector('audio')?.duration));
      await audio.evaluate((element) => { if (Number.isFinite(element.duration)) element.currentTime = Math.max(0, element.duration - 0.2); });
      await page.waitForFunction((old) => document.querySelector('audio')?.getAttribute('src') !== old, source, { timeout: 25000 });
      source = await audio.getAttribute('src');
    }
    await page.getByText('Радио по альбому', { exact: true }).and(page.locator(':visible')).first().waitFor();
    assert.equal(await audio.getAttribute('data-radio-identity'), 'persistent');
    await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && !a.paused && a.currentTime > 0.15; });
    const toggle = page.getByRole('checkbox', { name: /^Радио по альбому/ }).and(page.locator(':visible')).first();
    await toggle.uncheck();
    assert.equal(await page.evaluate(() => localStorage.getItem('audiolad:album-radio-enabled')), '0');
    const radioSrc = await audio.getAttribute('src');
    await audio.evaluate((element) => { element.currentTime = element.duration - 0.2; });
    await page.waitForFunction(() => document.querySelector('audio')?.ended);
    assert.equal(await audio.getAttribute('src'), radioSrc);
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('audiolad:album-radio-enabled')), '0');
    console.log(`${name}: real source playback, natural album end, same-element radio and opt-out passed`);
  } finally { await browser.close(); }
}
