#!/usr/bin/env node
/**
 * Static audit for deprecated global positioning phrases in production-relevant files.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  buildHomeMetadata,
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
} from "../src/lib/seo/public-page-metadata.ts";
import { buildHomeJsonLd } from "../src/lib/seo/json-ld/index.ts";

const ROOT = new URL("..", import.meta.url).pathname;

const FORBIDDEN_PHRASES = [
  "Авторские аудиолекции Сергея Петрова",
  "аудиолекции Сергея Петрова",
  "лекции Сергея Петрова",
  "авторских образовательных аудиолекций Сергея",
  "Более 12 лет работает с экспертами",
  "знаниями и цифровыми форматами обучения",
  "Платформа аудиопрактик, медитаций и энергетических программ",
];

const SCAN_DIRS = ["src", "public", "scripts"];

const ALLOWLIST = new Set([
  "scripts/seo-positioning-audit-unit.mjs",
  "scripts/checkout-return-unit.mjs",
  "scripts/author-promotion-unit.mjs",
  "supabase/migrations/20260713150000_seed_first_audio_course_practice.sql",
  "docs/PRODUCT_VISION.md",
  "AUDIOLAD_TECHNICAL_AUDIT.md",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".webmanifest",
  ".md",
  ".sql",
]);

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function collectFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const rel = relative(ROOT, fullPath).replace(/\\/g, "/");

    if (rel.startsWith(".worktrees/")) continue;

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") {
        continue;
      }
      collectFiles(fullPath, acc);
      continue;
    }

    const ext = entry.slice(entry.lastIndexOf("."));
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    acc.push(rel);
  }

  return acc;
}

function scanForbiddenPhrases() {
  const hits = [];

  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    for (const relPath of collectFiles(abs)) {
      if (ALLOWLIST.has(relPath)) continue;

      const content = readFileSync(join(ROOT, relPath), "utf8");

      for (const phrase of FORBIDDEN_PHRASES) {
        if (content.includes(phrase)) {
          hits.push({ file: relPath, phrase });
        }
      }
    }
  }

  return hits;
}

function testHomeMetadataValues() {
  const home = buildHomeMetadata();

  assert(home.title === HOME_SEO_TITLE, "home metadata title uses canonical SEO title");
  assert(
    home.description === HOME_SEO_DESCRIPTION,
    "home metadata description uses canonical SEO description",
  );
  assert(
    HOME_SEO_TITLE.includes(" – "),
    "home SEO title uses medium dash with spaces",
  );
  assert(
    !HOME_SEO_TITLE.includes("—"),
    "home SEO title must not use em dash",
  );
  assert(
    !HOME_SEO_DESCRIPTION.includes("—"),
    "home SEO description must not use em dash",
  );
  assert(
    !HOME_SEO_TITLE.includes("Сергей"),
    "home SEO title must not mention Sergey globally",
  );
  assert(
    !HOME_SEO_DESCRIPTION.includes("Сергей"),
    "home SEO description must not mention Sergey globally",
  );
  assert(
    home.openGraph?.title === HOME_SEO_TITLE,
    "Open Graph title matches home SEO title",
  );
  assert(
    home.openGraph?.description === HOME_SEO_DESCRIPTION,
    "Open Graph description matches home SEO description",
  );
  assert(
    home.twitter?.title === HOME_SEO_TITLE,
    "Twitter title matches home SEO title",
  );
  assert(
    home.twitter?.description === HOME_SEO_DESCRIPTION,
    "Twitter description matches home SEO description",
  );
  assert(
    home.alternates?.canonical === "https://audiolad.ru/",
    "home canonical uses production origin",
  );
}

function testHomeJsonLdValues() {
  const graph = buildHomeJsonLd("https://audiolad.ru");
  const serialized = JSON.stringify(graph);

  assert(
    serialized.includes(HOME_SEO_DESCRIPTION),
    "home JSON-LD includes canonical description",
  );
  assert(!serialized.includes("Сергей Петров"), "home JSON-LD has no Sergey Petrov");
  assert(
    !serialized.includes("энергетических программ"),
    "home JSON-LD removed old energetic programs wording",
  );
}

function testLayoutAndManifestSources() {
  const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
  const manifest = readFileSync(join(ROOT, "public/manifest.webmanifest"), "utf8");
  const guestHome = readFileSync(join(ROOT, "src/components/home/GuestHome.tsx"), "utf8");
  const requisites = readFileSync(join(ROOT, "src/app/requisites/page.tsx"), "utf8");

  assert(layout.includes("HOME_SEO_TITLE"), "root layout uses canonical home title constant");
  assert(layout.includes("HOME_SEO_DESCRIPTION"), "root layout uses canonical description constant");
  assert(manifest.includes(HOME_SEO_DESCRIPTION), "manifest uses canonical description");
  assert(
    guestHome.includes("платформа авторских аудиопрактик, медитаций и программ"),
    "guest home visible text includes platform positioning",
  );
  assert(
    !requisites.includes("аудиолекций Сергея"),
    "requisites page removed Sergey lectures positioning",
  );
}

const forbiddenHits = scanForbiddenPhrases();

if (forbiddenHits.length) {
  for (const hit of forbiddenHits) {
    failures.push(`forbidden phrase "${hit.phrase}" in ${hit.file}`);
  }
}

testHomeMetadataValues();
testHomeJsonLdValues();
testLayoutAndManifestSources();

if (failures.length) {
  console.error("seo-positioning-audit-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("seo-positioning-audit-unit: all checks passed");
