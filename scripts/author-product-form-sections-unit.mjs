#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const sectionsDir = "src/components/author-dashboard/product-form-sections";

const sectionFiles = {
  charCounter: `${sectionsDir}/AuthorProductCharCounter.tsx`,
  statusNotices: `${sectionsDir}/AuthorProductFormStatusNotices.tsx`,
  listeningNotice: `${sectionsDir}/AuthorProductListeningNoticeSection.tsx`,
  postListenPromo: `${sectionsDir}/AuthorProductPostListenPromoSection.tsx`,
  actions: `${sectionsDir}/AuthorProductFormActions.tsx`,
};

for (const rel of Object.values(sectionFiles)) {
  assert.ok(read(rel).length > 0, `missing section file ${rel}`);
}

assert.match(
  form,
  /from "@\/components\/author-dashboard\/product-form-sections\/AuthorProductCharCounter"/,
);
assert.match(
  form,
  /from "@\/components\/author-dashboard\/product-form-sections\/AuthorProductFormStatusNotices"/,
);
assert.match(
  form,
  /from "@\/components\/author-dashboard\/product-form-sections\/AuthorProductListeningNoticeSection"/,
);
assert.match(
  form,
  /from "@\/components\/author-dashboard\/product-form-sections\/AuthorProductPostListenPromoSection"/,
);
assert.match(
  form,
  /from "@\/components\/author-dashboard\/product-form-sections\/AuthorProductFormActions"/,
);

assert.match(form, /<AuthorProductFormStatusNotices/);
assert.match(form, /<AuthorProductListeningNoticeSection/);
assert.match(form, /<AuthorProductPostListenPromoSection/);
assert.match(form, /<AuthorProductFormActions/);
assert.match(form, /AuthorProductCharCounter as CharCounter/);

const listening = read(sectionFiles.listeningNotice);
assert.match(listening, /Рекомендации перед прослушиванием/);
assert.match(listening, /Вернуть стандартный текст/);

const actions = read(sectionFiles.actions);
assert.match(actions, /Предпросмотр/);
assert.match(actions, /Отправить на модерацию/);
assert.match(actions, /Опубликовать снова/);
assert.match(actions, /isDraft && canBypassProductModeration/);

const status = read(sectionFiles.statusNotices);
assert.match(status, /PRODUCT_CONTENT_LOCKED_AFTER_SALE|contentLockedAfterSale/);

const promo = read(sectionFiles.postListenPromo);
assert.match(promo, /promoEnabled|Рекомендация после прослушивания|После прослушивания/);

// Structural presence still owned by the form controller
assert.match(form, /Основная информация/);
assert.match(form, /AuthorProductSeoSection/);
assert.match(form, /Содержание аудиопродукта|Треки/);
assert.match(form, /catalogVisibility|CATALOG_VISIBILITY/);
assert.match(form, /CATALOG_GALLERY_MAX_SLIDES|gallery/);

// This PR must not enable the wizard UI
assert.doesNotMatch(form, /isAuthorProductWizardEnabled/);
assert.doesNotMatch(form, /parseProductWizardStep/);
assert.doesNotMatch(form, /\?step=/);
assert.doesNotMatch(form, /product-wizard-beta/);
assert.doesNotMatch(form, /PRODUCT_WIZARD_STEPS/);
assert.doesNotMatch(actions, /isAuthorProductWizardEnabled/);
assert.doesNotMatch(listening, /isAuthorProductWizardEnabled/);

console.log("author-product-form-sections-unit: ok");
