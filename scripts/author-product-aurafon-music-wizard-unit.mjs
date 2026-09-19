#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import { isAurafonMusicWizard } from "../src/lib/author-products/aurafon-music-wizard.ts";
import {
  AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE,
  hasAudioProductAuthor,
} from "../src/lib/author-products/audio-product-author.ts";
import {
  PRODUCT_CONTENT_LIMITS,
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
  validateAudioProductAuthorLength,
} from "../src/lib/author-products/limits.ts";
import {
  MUSIC_TRACK_TITLE_CYRILLIC_ERROR,
  musicTrackTitleHasCyrillic,
  validateMusicTrackTitleForAurafonWizard,
} from "../src/lib/author-products/music-track-title.ts";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import { CATALOG_GALLERY_MAX_SLIDES } from "../src/lib/catalog/gallery.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const OTHER = "00000000-0000-4000-8000-000000000099";

// Profile gate
assert.equal(
  isAurafonMusicWizard({
    authorId: AURAFON_AUTHOR_ID,
    productKind: PRODUCT_KIND.MUSIC,
  }),
  true,
);
assert.equal(
  isAurafonMusicWizard({
    authorId: AURAFON_AUTHOR_ID,
    productKind: PRODUCT_KIND.PRACTICE,
  }),
  false,
);
assert.equal(
  isAurafonMusicWizard({
    authorId: OTHER,
    productKind: PRODUCT_KIND.MUSIC,
  }),
  false,
);

// Author field helpers + canonical length / field-error contract
assert.equal(hasAudioProductAuthor(""), false);
assert.equal(hasAudioProductAuthor("Сергей"), true);
assert.equal(AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE, "Укажите автора музыки.");
assert.equal(PRODUCT_CONTENT_LIMITS.audioProductAuthor, 120);
assert.equal(validateAudioProductAuthorLength("x".repeat(121)), "audio_product_author_too_long");
assert.equal(validateAudioProductAuthorLength("ok"), null);
assert.equal(
  getProductFieldErrorMessage("audio_product_author_too_long"),
  "Автор аудиопродукта не должен превышать 120 символов.",
);
assert.equal(
  getProductFieldKeyForError("audio_product_author_too_long"),
  "audioProductAuthor",
);

// Cyrillic titles
const pass = [
  "Подводные сны",
  "Подводные сны (Underwater Dreams)",
  "Музыка SPA для массажа",
  "Ёлка",
];
const fail = ["Underwater Dreams", "SPA Relax", "123", "---"];
for (const title of pass) {
  assert.equal(musicTrackTitleHasCyrillic(title), true, title);
  assert.equal(validateMusicTrackTitleForAurafonWizard(title), null, title);
}
for (const title of fail) {
  assert.equal(musicTrackTitleHasCyrillic(title), false, title);
  assert.equal(
    validateMusicTrackTitleForAurafonWizard(title),
    MUSIC_TRACK_TITLE_CYRILLIC_ERROR,
    title,
  );
}

// Migration
const migration = read(
  "supabase/migrations/20261019120100_practice_audio_product_author.sql",
);
assert.match(migration, /ADD COLUMN IF NOT EXISTS audio_product_author text NULL/);
assert.match(migration, /char_length\(audio_product_author\) <= 120/);
assert.doesNotMatch(migration, /NOT NULL(?!.*DEFAULT)/);

// Form / API wiring
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const route = read("src/app/api/author/products/[id]/route.ts");
const products = read("src/lib/author-products/products.ts");
const types = read("src/lib/author-products/types.ts");
const merge = read("src/lib/author-products/form-merge.ts");

assert.match(products, /audio_product_author/);
assert.match(types, /audio_product_author: string \| null/);
assert.match(merge, /audioProductAuthor/);
assert.match(route, /audio_product_author/);
assert.match(route, /validateAudioProductAuthorLength/);
assert.match(form, /audio_product_author: form\.audioProductAuthor/);
assert.match(form, /Автор музыки/);
assert.match(form, /AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE/);
assert.match(form, /assertAurafonMusicReadyForPublish/);
assert.match(form, /validateMusicTrackTitleForAurafonWizard/);
assert.match(form, /Название \(обязательно, на русском языке\)/);
assert.match(form, /Подназвание \(необязательно\)/);
assert.match(form, /Доступ для слушателей АудиоЛада/);
assert.match(form, /Использование музыки в Студии АудиоЛада/);
assert.match(form, /order-1/);
assert.match(form, /order-2/);
assert.match(form, /aurafonMusicWizard && wizardStep === 4/);

// Save & Continue gate structure
assert.match(
  form,
  /async function saveWizardStepAndContinue[\s\S]*wizardStep === 1[\s\S]*applyAurafonMusicAuthorFieldError[\s\S]*return;/,
);
assert.match(
  form,
  /async function saveWizardStepAndContinue[\s\S]*wizardStep === 2[\s\S]*applyAurafonMusicTrackTitleErrors[\s\S]*return;/,
);
assert.match(
  form,
  /async function openPublishPreviewTab[\s\S]*assertAurafonMusicReadyForPublish/,
);
assert.match(
  form,
  /async function publishProduct[\s\S]*assertAurafonMusicReadyForPublish/,
);

// Non-music / non-aurafon must not force author label globally
assert.match(form, /isAurafonMusicWizard\(\{[\s\S]*Автор музыки/);

assert.equal(CATALOG_GALLERY_MAX_SLIDES, 30);
assert.equal(AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE, "Укажите автора музыки.");

const audioAuthorHelper = read("src/lib/author-products/audio-product-author.ts");
assert.doesNotMatch(audioAuthorHelper, /validateAudioProductAuthorLength/);
assert.doesNotMatch(audioAuthorHelper, /AUDIO_PRODUCT_AUTHOR_MAX_LENGTH/);
assert.doesNotMatch(audioAuthorHelper, /normalizeAudioProductAuthor/);
const limitsSrc = read("src/lib/author-products/limits.ts");
assert.match(limitsSrc, /audio_product_author_too_long/);
assert.match(limitsSrc, /Автор аудиопродукта не должен превышать 120 символов/);
assert.match(limitsSrc, /case "audio_product_author_too_long":\s*return "audioProductAuthor"/);
assert.match(form, /PRODUCT_CONTENT_LIMITS\.audioProductAuthor/);
assert.match(form, /fieldKey === "audioProductAuthor"/);
assert.doesNotMatch(form, /aurafonMusicWizard\s*\?\s*"Цена для Студии/);

console.log("author-product-aurafon-music-wizard-unit: ok");
