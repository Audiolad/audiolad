// t1485u: renders the closed-catalog track rows with the three automatic Shazam states
// (проверяется / совпадений нет / найдено совпадение) from the real components and
// screenshots them. Usage: npx tsx scripts/business-shazam-preview.mts <out-dir>
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
import * as ui from '../src/app/(platform)/admin/business-catalog/ShazamAutoStatus';
import type { ShazamCheckRow } from '../src/lib/business-track-passports/shazam';
import type { Passport } from '../src/lib/business-track-passports/model';

const mod = ((ui as unknown as { default?: typeof ui }).default?.ShazamAutoStatus ? (ui as unknown as { default: typeof ui }).default : ui);
const outDir = resolve(process.argv[2] ?? 'docs/pr-previews/t1485u-auto-shazam');
mkdirSync(outDir, { recursive: true });

type Row = { title: string; check: ShazamCheckRow | null; passport?: Passport };
const rows: Row[] = [
  { title: 'Бодрое зерно', check: { audio_item_id: '1', status: 'running', attempts: 1 } },
  {
    title: 'На ходу',
    check: { audio_item_id: '2', status: 'no_match', passport_written: true, finished_at: '2026-11-16T07:48:00Z' },
    passport: { shazam_result: 'not_found', shazam_checked_at: '2026-11-16T07:48:00Z', status: 'draft' },
  },
  {
    title: 'Вдох города',
    check: {
      audio_item_id: '3', status: 'match', finished_at: '2026-11-16T07:50:00Z',
      segments: [
        { label: 't30', offset_seconds: 30, matched: true, title: 'Пример найденной песни', artist: 'Пример исполнителя', timeskew: 0.0004, frequencyskew: 0.0002 },
        { label: 'mid', offset_seconds: 85, matched: false },
        { label: 'end30', offset_seconds: 156, matched: false },
      ],
    },
  },
];

const draft = 'rounded-full bg-[#f4eefe] px-2.5 py-0.5 text-xs font-semibold text-[#7042c5]';
const body = h('div', { className: 'mx-auto max-w-[760px] p-6' },
  h('details', { open: true, className: 'rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] p-3' },
    h('summary', { className: 'cursor-pointer text-sm font-medium text-[#25135c]' }, 'Треки'),
    h('div', { className: 'mt-3 space-y-3' }, rows.map((row) => h('details', { key: row.title, open: true, className: 'rounded-[18px] border border-[#e4d7f4] bg-white p-3' },
      h('summary', { className: 'cursor-pointer text-sm font-medium text-[#25135c]' },
        h('span', null, row.title), ' ', h('span', { className: draft }, 'черновик'), ' ',
        h(mod.ShazamAutoBadge, { check: row.check, passport: row.passport })),
      h('div', { className: 'mt-3' }, h(mod.ShazamAutoStatus, { check: row.check, passport: row.passport })),
    )))));
const markup = renderToStaticMarkup(body);
const dir = mkdtempSync(join(tmpdir(), 'shazam-preview-'));
writeFileSync(join(dir, 'preview.html'), markup);
const css = await postcss([tailwind({ base: process.cwd() })]).process(`@import "tailwindcss";\n@source "${dir}/preview.html";`, { from: join(process.cwd(), 'shazam-preview.css') });
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${css.css}</style></head><body style="background:#f7f2fc;font-family:Inter,Arial,sans-serif">${markup}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.locator('body > div').screenshot({ path: join(outDir, 'track-rows.png') });
for (const [index, state] of ['pending', 'no_match', 'match'].entries()) {
  await page.locator('details details').nth(index).screenshot({ path: join(outDir, `track-row-${state}.png`) });
}
await browser.close();
console.log(`business-shazam-preview: ${outDir}`, readFileSync(join(outDir, 'track-rows.png')).length);
