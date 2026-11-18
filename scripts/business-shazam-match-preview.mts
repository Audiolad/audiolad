// t1522u: renders the real closed-catalog album card (ClosedAlbumWork) with the prod data shape of
// «Разговоры на фоне»: 9 tracks admitted, «Деревянная стойка» – Shazam match «つぶあん – 夏風君の髪をさらって»
// at 1:20–1:35, passport Shazam fields empty. Screenshots desktop and mobile.
// Usage: node --require ./scripts/cjs-stub-server-only.cjs --import tsx scripts/business-shazam-match-preview.mts <out-dir>
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import * as work from '../src/app/(platform)/admin/business-catalog/ClosedAlbumWork';
import { DEFAULT_CATALOG_PASSPORT_DEFAULTS } from '../src/lib/business-track-passports/shared';
import type { Passport } from '../src/lib/business-track-passports/model';
import type { ShazamCheckRow } from '../src/lib/business-track-passports/shazam';

type WorkModule = typeof work;
const mod = ((work as unknown as { default?: WorkModule }).default?.default ? (work as unknown as { default: WorkModule }).default : work);
const ClosedAlbumWork = mod.default;
const outDir = resolve(process.argv[2] ?? 'docs/pr-previews/t1522u-shazam-match');
mkdirSync(outDir, { recursive: true });

const sha = (c: string) => c.repeat(64);
const base: Passport = {
  al_code: 'AL-T-PREVIEW', generator_tool: 'Suno', generator_plan: 'Pro', generated_at: '2026-11-18T05:40:00Z',
  generation_ref: 'preview', terms_snapshot_ref: 'preview', human_contribution: 'none', human_contribution_details: null,
  source_sha256: sha('a'), master_sha256: sha('a'), stored_master_sha256: sha('a'), stored_master_asset_id: 'm',
  stored_master_sha256_verified_at: '2026-11-18T06:08:00Z', fingerprint_sha256: sha('b'),
  shazam_checked_at: '2026-11-18T05:50:00Z', shazam_result: 'not_found', acoustid_checked_at: '2026-11-18T06:08:00Z',
  acoustid_result: 'not_found', never_published_checked_at: '2026-11-18T06:08:00Z', evidence_inventory_sha256: sha('c'),
  status: 'approved',
} as Passport;
const titles = ['Два места рядом', 'Деревянная стойка', 'Запах выпечки', 'Здесь и сейчас', 'Листья за окном', 'Между словами', 'Негромкие истории', 'Повод остаться', 'Светлые струны', 'Тихое оживление'];
const matchCheck: ShazamCheckRow = {
  audio_item_id: 'f563378b', master_asset_id: '2ee100eb', status: 'match', attempts: 1, passport_written: false,
  library_version: 'shazamio 0.9.0', created_at: '2026-11-18T05:49:05Z', finished_at: '2026-11-18T05:51:12Z',
  segments: [
    { label: 't30', matched: false, offset_seconds: 30, duration_seconds: 15, title: null, artist: null },
    { label: 'mid', matched: true, offset_seconds: 80, duration_seconds: 15, title: '夏風君の髪をさらって', artist: 'つぶあん', timeskew: -0.0007792115, frequencyskew: -0.0006441474 },
    { label: 'end30', matched: false, offset_seconds: 146, duration_seconds: 15, title: null, artist: null },
  ],
};
const tracks = titles.map((title, index) => {
  if (title !== 'Деревянная стойка') {
    return { id: `t${index}`, title, passport: base, shazamCheck: { audio_item_id: `t${index}`, status: 'no_match' as const, passport_written: true, finished_at: '2026-11-18T05:50:00Z' } };
  }
  return {
    id: 'f563378b', title,
    passport: { ...base, status: 'draft', shazam_result: null, shazam_checked_at: null, approved_by: null, approved_at: null } as Passport,
    shazamCheck: matchCheck, shazamFinalCheck: matchCheck, shazamGate: { autoMaster: null, currentMaster: '2ee100eb' },
  };
});
const albums = [{ id: '60af87ba', title: 'Разговоры на фоне', author_id: 'a', authorName: 'АудиоЛад', status: 'draft', tracks }];
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const markup = renderToStaticMarkup(h(AppRouterContext.Provider, { value: router as never },
  h('div', { className: 'mx-auto max-w-[900px] p-4' }, h(ClosedAlbumWork, { albums, catalogLicenseRef: null, catalogDefaults: DEFAULT_CATALOG_PASSPORT_DEFAULTS }))));
const dir = mkdtempSync(join(tmpdir(), 'shazam-match-preview-'));
writeFileSync(join(dir, 'preview.html'), markup);
const css = await postcss([tailwind({ base: process.cwd() })]).process(`@import "tailwindcss";\n@source "${dir}/preview.html";`, { from: join(process.cwd(), 'shazam-match-preview.css') });
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${css.css}</style></head><body style="background:#f7f2fc;font-family:Inter,Arial,'Noto Sans CJK JP',sans-serif">${markup}</body></html>`;
writeFileSync(join(outDir, 'preview.html'), html);

const browser = await chromium.launch();
for (const [name, width] of [['desktop', 1280], ['mobile', 390]] as const) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.locator('article').first().screenshot({ path: join(outDir, `album-${name}.png`) });
  // Open «Треки» and the matched track's row to show the track form panel too.
  await page.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll('article details'))) {
      const s = d.querySelector('summary')?.textContent ?? '';
      if (s.startsWith('Треки') || s.includes('Деревянная стойка')) (d as HTMLDetailsElement).open = true;
    }
  });
  const row = page.locator('article details details', { hasText: 'Деревянная стойка' }).first();
  await row.screenshot({ path: join(outDir, `track-${name}.png`) });
  await page.close();
}
await browser.close();
console.log(`business-shazam-match-preview: ${outDir}`);
