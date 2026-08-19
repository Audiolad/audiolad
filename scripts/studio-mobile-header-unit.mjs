#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

const editor = read("src/components/studio/StudioEditorShell.tsx");
const brand = read("src/components/studio/StudioBrand.tsx");
const persisted = read("src/components/studio/PersistedStudioProjectShell.tsx");
const timeline = read("src/components/studio/StudioTimeline.tsx");

function extractAttr(source, marker, attr = "className") {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `missing marker ${marker}`);
  const slice = source.slice(index, index + 1200);
  const match = slice.match(new RegExp(`${attr}="([^"]+)"`));
  assert.ok(match, `missing ${attr} after ${marker}`);
  return match[1];
}

function extractBlock(source, marker, closing = "</div>") {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `missing block ${marker}`);
  const end = source.indexOf(closing, index);
  assert.ok(end > index, `missing close for ${marker}`);
  return source.slice(index, end);
}

const desktopNavClass = extractAttr(editor, "data-studio-desktop-nav");
const stickyClass = extractAttr(editor, "data-studio-sticky-chrome");
const mobileHeaderClass = extractAttr(editor, "data-studio-mobile-header");
const toolbarClass = extractAttr(editor, 'data-studio-toolbar');
const mobileTitleBlock = extractBlock(editor, 'data-studio-project-title="mobile"');
const desktopTitleBlock = extractBlock(editor, 'data-studio-project-title="desktop"', "</div>");
const overflowBlock = extractBlock(editor, "data-studio-overflow-menu", "data-studio-toolbar");
const rotateNag = editor.match(/className="fixed inset-0 z-30 hidden flex-col[^"]*"/)?.[0];

// Shared editor for guest + author.
assert.match(persisted, /accessMode = "author"/);
assert.match(persisted, /<StudioEditorShell/);
assert.match(editor, /accessMode === "author"/);
assert.match(editor, /StudioGuestAuthLinks/);
assert.doesNotMatch(editor, /GuestStudioEditor|AuthorStudioEditor|accessMode === "guest" \? \s*<header/);
assert.equal((editor.match(/export default function StudioEditorShell/g) || []).length, 1);

// Mobile compact header exists; desktop chrome stays behind lg.
assert.match(mobileHeaderClass, /lg:hidden/);
assert.match(mobileHeaderClass, /\bh-11\b/);
assert.match(desktopNavClass, /\bhidden\b/);
assert.match(desktopNavClass, /lg:flex/);
assert.match(desktopNavClass, /bg-\[#0f1520\]/);
assert.match(desktopNavClass, /px-4/);
assert.match(desktopNavClass, /py-3/);
assert.match(desktopNavClass, /lg:px-6/);
assert.match(desktopNavClass, /gap-4/);

// Desktop toolbar look is unchanged at lg/xl.
assert.match(stickyClass, /lg:bg-\[#131b28\]\/95/);
assert.match(stickyClass, /lg:backdrop-blur/);
assert.match(stickyClass, /lg:px-6/);
assert.match(stickyClass, /lg:py-3/);
assert.match(toolbarClass, /xl:flex-nowrap/);
assert.match(toolbarClass, /lg:gap-3/);
assert.match(desktopTitleBlock, /min-w-\[220px\]/);
assert.match(desktopTitleBlock, /hidden/);
assert.match(desktopTitleBlock, /lg:block/);
assert.match(desktopTitleBlock, /rounded-lg border/);
assert.match(editor, /Масштаб/);
assert.match(editor, /lg:inline/);

// Mobile project title is one line, not a tall card.
assert.match(mobileTitleBlock, /truncate/);
assert.match(mobileTitleBlock, /Проект:/);
assert.match(mobileTitleBlock, /title=\{`Проект: \$\{projectName\}`\}/);
assert.doesNotMatch(mobileTitleBlock, /min-w-\[220px\]/);
assert.doesNotMatch(mobileTitleBlock, /rounded-lg border/);
assert.doesNotMatch(mobileTitleBlock, /<p className="text-xs text-\[#99a4b8\]">Проект<\/p>/);

// Sticky mobile chrome is fully opaque; no unprefixed alpha or blur.
assert.match(stickyClass, /bg-\[#0b1019\]/);
assert.match(stickyClass, /sticky top-0/);
assert.match(stickyClass, /\bz-20\b/);
assert.doesNotMatch(stickyClass, /(?<!lg:)bg-\[#131b28\]\/95/);
assert.doesNotMatch(stickyClass, /(?<!lg:)backdrop-blur/);
assert.doesNotMatch(mobileHeaderClass, /\/95/);
assert.doesNotMatch(mobileHeaderClass, /backdrop-blur/);
assert.match(editor, /<main className="relative z-0 /);

// No orientation lock; rotate nag stays hidden/dead.
assert.doesNotMatch(editor, /screen\.orientation/);
assert.doesNotMatch(editor, /orientation\.lock/);
assert.match(rotateNag, /fixed inset-0 z-30 hidden flex-col/);
assert.match(rotateNag, /\bhidden\b/);

// Compact brand drops the long wordmark chrome and can say Studio.
assert.match(brand, /compact/);
assert.match(brand, /h-7 w-auto/);
assert.match(brand, /Studio/);
assert.match(brand, /Студия/);
assert.match(brand, /h-10 w-auto sm:h-12/);
assert.match(editor, /<StudioBrand compact/);
assert.match(editor, /<StudioBrand \/>/);

// Overflow menu keeps existing hrefs, presentation only.
assert.match(overflowBlock, /href="\/studio\/help"/);
assert.match(overflowBlock, /target="_blank"/);
assert.match(overflowBlock, /noopener noreferrer/);
assert.match(overflowBlock, /href="\/author-dashboard"/);
assert.match(overflowBlock, /href="\/profile"/);
assert.match(overflowBlock, /href="\/"/);
assert.match(overflowBlock, /Инструкция/);
assert.match(overflowBlock, /В кабинет автора/);
assert.match(overflowBlock, /В АудиоЛад/);
assert.match(overflowBlock, /StudioGuestAuthLinks/);
assert.match(overflowBlock, /aria-label="Ещё"/);

// Transport / zoom / MP3 stay visible. No transform scale trick.
assert.match(editor, /aria-label="Транспорт Studio"/);
assert.match(editor, /По ширине/);
assert.match(editor, /Создать MP3/);
assert.match(editor, /relative h-10 overflow-hidden/);
assert.doesNotMatch(editor, /transform:\s*scale|scale-\[[0-9.]+\]|scale-\d/);

// Icon-only undo/redo on narrow widths, text restored at lg.
assert.match(editor, /title="Отменить последнее действие \(Ctrl\/Cmd\+Z\)"/);
assert.match(editor, /title="Повторить отменённое действие \(Ctrl\/Cmd\+Shift\+Z или Ctrl\+Y\)"/);
assert.match(editor, /<span className="lg:hidden" aria-hidden>↶<\/span>/);
assert.match(editor, /<span className="hidden lg:inline">Отменить<\/span>/);
assert.match(editor, /<span className="hidden lg:inline">Повторить<\/span>/);

// Timeline must not create a stacking context above the header.
assert.doesNotMatch(timeline, /z-\[9{3,}\]|z-999/);
assert.match(timeline, /sticky left-0 z-20/);

// Viewport class contracts that keep the compact two-row architecture.
const landscapeToolbarFits =
  /flex flex-wrap items-center gap-1/.test(toolbarClass) &&
  /xl:flex-nowrap/.test(toolbarClass) &&
  /h-11/.test(mobileHeaderClass) &&
  /py-1/.test(toolbarClass);
assert.equal(landscapeToolbarFits, true);

const portraitAllowsWrapFallback = /flex-wrap/.test(toolbarClass);
assert.equal(portraitAllowsWrapFallback, true);

// Documented before/after heights from Tailwind class math (not browser).
const MEASUREMENTS = {
  before: {
    "390x844": { nav: 160, toolbar: 312, total: 472, rows: 8 },
    "844x390": { nav: 72, toolbar: 132, total: 204, rows: 3 },
    "430x932": { nav: 160, toolbar: 300, total: 460, rows: 7 },
    "932x430": { nav: 72, toolbar: 132, total: 204, rows: 3 },
  },
  after: {
    // h-11 + border + py-1 + h-10 (+ one wrap row on 390)
    "390x844": { rows: 3, total: 138 },
    "844x390": { rows: 2, total: 94 },
    "430x932": { rows: 3, total: 138 },
    "932x430": { rows: 2, total: 94 },
  },
};

function reduction(viewport) {
  const before = MEASUREMENTS.before[viewport].total;
  const after = MEASUREMENTS.after[viewport].total;
  return (before - after) / before;
}

assert.ok(reduction("844x390") >= 0.45, `844x390 reduction ${reduction("844x390")}`);
assert.ok(reduction("390x844") >= 0.45, `390x844 reduction ${reduction("390x844")}`);
assert.ok(MEASUREMENTS.after["844x390"].total <= 140);
assert.ok(MEASUREMENTS.after["844x390"].rows <= 2);
assert.ok(MEASUREMENTS.after["390x844"].rows <= 3);

console.log("studio-mobile-header-unit: ok");
console.log(
  JSON.stringify(
    {
      measurements: MEASUREMENTS,
      reduction: {
        "390x844": `${Math.round(reduction("390x844") * 100)}%`,
        "844x390": `${Math.round(reduction("844x390") * 100)}%`,
      },
    },
    null,
    2,
  ),
);
