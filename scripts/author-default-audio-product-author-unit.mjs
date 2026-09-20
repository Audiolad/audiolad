#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hasAudioProductAuthor } from "../src/lib/author-products/audio-product-author.ts";
import { PRODUCT_CONTENT_LIMITS } from "../src/lib/author-products/limits.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

// A — has helper + canonical max
assert.equal(hasAudioProductAuthor(""), false);
assert.equal(hasAudioProductAuthor("Сергей"), true);
assert.equal(PRODUCT_CONTENT_LIMITS.audioProductAuthor, 120);

// B — migration additive, nullable, length ≤120, no backfill
const migration = read(
  "supabase/migrations/20261020120000_author_default_audio_product_author.sql",
);
assert.match(
  migration,
  /ADD COLUMN IF NOT EXISTS default_audio_product_author text NULL/,
);
assert.match(
  migration,
  /authors_default_audio_product_author_length_check/,
);
assert.match(migration, /char_length\(default_audio_product_author\) <= 120/);
assert.doesNotMatch(migration, /UPDATE\s+public\.authors/i);
assert.doesNotMatch(migration, /NOT NULL(?!\s*OR)/);

// C — seed helper: conditional IS NULL update + log on failure
const seed = read(
  "src/lib/author-products/seed-default-audio-product-author.ts",
);
assert.match(seed, /seedAuthorDefaultAudioProductAuthorIfAbsent/);
assert.match(seed, /\.is\("default_audio_product_author",\s*null\)/);
assert.match(seed, /normalizeAudioProductAuthor/);
assert.match(seed, /author_default_audio_product_author_seed_failed/);
assert.doesNotMatch(seed, /throw /);

// D — workspace type + loaders select default
const types = read("src/lib/author-products/types.ts");
assert.match(types, /defaultAudioProductAuthor:\s*string\s*\|\s*null/);

const auth = read("src/lib/author-products/auth.ts");
assert.match(auth, /default_audio_product_author/);
assert.match(auth, /defaultAudioProductAuthor:/);

const support = read("src/lib/author-support/store.ts");
assert.match(support, /default_audio_product_author/);
assert.match(support, /defaultAudioProductAuthor:/);

// E — form create prefill + edit blank fallback + author switch leaves draft
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /function resolveFormAudioProductAuthor/);
assert.match(form, /resolveFormAudioProductAuthor\(\s*authors,\s*author\?\.id/);
assert.match(
  form,
  /resolveFormAudioProductAuthor\(\s*authors,\s*snapshot\.authorId/,
);
assert.match(
  form,
  /authorId:\s*event\.target\.value,?\s*\}\)/,
);
assert.doesNotMatch(
  form,
  /authorId:\s*event\.target\.value,\s*audioProductAuthor:/,
);

// F — PATCH wires non-critical seed after successful product load
const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /seedAuthorDefaultAudioProductAuthorIfAbsent/);
assert.match(
  patch,
  /audioProductAuthor:\s*product\.practice\.audio_product_author/,
);
const seedIdx = patch.indexOf("seedAuthorDefaultAudioProductAuthorIfAbsent");
const returnIdx = patch.indexOf("return NextResponse.json({ product });");
assert.ok(seedIdx > 0 && returnIdx > seedIdx, "seed before success return");

// G — package script registered
const pkg = JSON.parse(read("package.json"));
assert.equal(
  pkg.scripts["test:author-default-audio-product-author"],
  "npx tsx scripts/author-default-audio-product-author-unit.mjs",
);


// H — dirty baseline + support/promotion workspace mapping
const editorSave = read("src/lib/author-products/editor-save-state.ts");
assert.match(editorSave, /audioProductAuthor/);
const supportCtx = read("src/lib/author-support/context.ts");
assert.match(supportCtx, /defaultAudioProductAuthor: membership\.defaultAudioProductAuthor/);
const promo = read("src/lib/promotion/access.ts");
assert.match(promo, /default_audio_product_author/);
assert.match(promo, /defaultAudioProductAuthor:/);

console.log("author-default-audio-product-author-unit: ok");
