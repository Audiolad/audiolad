#!/usr/bin/env node
/**
 * Regression for Core task 7e416c9a (2026-10-08): «Предпросмотр» on an audio
 * post bounced the author back to the editor while/after the optional MP4
 * export rendered. Production evidence: the preview CTA saves first and the
 * PATCH returned HTTP 400; the pre-opened tab was closed with no visible
 * reason near the button. MP4 render state was not involved.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PREVIEW_SAVE_FAILED_PREFIX,
  PRODUCT_VIDEO_EXPORT_STATES,
  canOpenPreviewOrPublishDespiteVideoExport,
  firstProductSaveFailureReason,
  formatPreviewSaveFailureMessage,
  isPromoRecommendationErrorCode,
  shouldShowProductActionsError,
} from "../src/lib/author-products/publish-preview-flow";
import { validatePromoRecommendation } from "../src/lib/products/promo-recommendation";
import AuthorProductFormActionsModule from "../src/components/author-dashboard/product-form-sections/AuthorProductFormActions";
import AuthorProductPostListenPromoSectionModule from "../src/components/author-dashboard/product-form-sections/AuthorProductPostListenPromoSection";

// tsx loads .tsx client components through CJS interop from an .mts entry.
function unwrapDefault<T>(value: T): T {
  const candidate = value as unknown as { default?: T };
  return typeof value === "function" ? value : (candidate.default ?? value);
}
const AuthorProductFormActions = unwrapDefault(AuthorProductFormActionsModule);
const AuthorProductPostListenPromoSection = unwrapDefault(
  AuthorProductPostListenPromoSectionModule,
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  let depth = 0;
  let opened = false;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      opened = true;
    } else if (char === "}") {
      depth -= 1;
      if (opened && depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unterminated ${signature}`);
}

// 1. Concrete reason instead of a silent bounce.
assert.equal(
  formatPreviewSaveFailureMessage("Укажите корректную безопасную ссылку."),
  `${PREVIEW_SAVE_FAILED_PREFIX}: Укажите корректную безопасную ссылку.`,
);
assert.equal(
  formatPreviewSaveFailureMessage(null),
  `${PREVIEW_SAVE_FAILED_PREFIX}: проверьте отмеченные поля.`,
);
assert.equal(
  formatPreviewSaveFailureMessage("   "),
  `${PREVIEW_SAVE_FAILED_PREFIX}: проверьте отмеченные поля.`,
);
assert.equal(
  formatPreviewSaveFailureMessage(`${PREVIEW_SAVE_FAILED_PREFIX}: x`),
  `${PREVIEW_SAVE_FAILED_PREFIX}: x`,
  "no double prefix",
);

assert.equal(firstProductSaveFailureReason({}), null);
assert.equal(
  firstProductSaveFailureReason({
    fieldErrors: { title: undefined, description: "Описание слишком длинное" },
  }),
  "Описание слишком длинное",
);
assert.equal(
  firstProductSaveFailureReason({
    error: "Общая ошибка",
    promoError: "Промо",
    fieldErrors: { title: "Название" },
  }),
  "Общая ошибка",
);
assert.equal(
  firstProductSaveFailureReason({
    promoError: "Укажите ссылку рекомендации.",
    fieldErrors: { title: "Название" },
  }),
  "Укажите ссылку рекомендации.",
);
assert.equal(
  firstProductSaveFailureReason({
    audioFieldErrors: { a1: { title: "" }, a2: { description: "Описание трека" } },
  }),
  "Описание трека",
);

for (const code of [
  "promo_title_required",
  "promo_text_required",
  "promo_button_text_required",
  "promo_url_required",
  "promo_url_invalid",
]) {
  assert.equal(isPromoRecommendationErrorCode(code), true, code);
}
for (const code of [null, undefined, "", "title_too_long", "invalid_request"]) {
  assert.equal(isPromoRecommendationErrorCode(code), false, String(code));
}

// Audio-post promo block: server and client share one validator.
assert.equal(
  validatePromoRecommendation({
    promo_enabled: true,
    promo_title: "Заголовок",
    promo_text: "Текст",
    promo_button_text: "Кнопка",
    promo_url: "https://max.ru/example",
    promo_open_in_new_tab: true,
  }).ok,
  true,
);
for (const [url, code] of [
  ["", "promo_url_required"],
  ["http://max.ru/example", "promo_url_invalid"],
] as const) {
  const result = validatePromoRecommendation({
    promo_enabled: true,
    promo_title: "Заголовок",
    promo_text: "Текст",
    promo_button_text: "Кнопка",
    promo_url: url,
  });
  assert.equal(result.ok, false, url);
  assert.equal(!result.ok && result.code, code);
  assert.equal(!result.ok && isPromoRecommendationErrorCode(result.code), true);
}

// 2. The actions error is visible next to every preview/publish CTA.
const actionStates = [
  { name: "draft bypass", isDraft: true, isUnpublished: false, needsChanges: false, isPublished: false, isSubmitted: false, bypass: true, show: true },
  { name: "draft moderated", isDraft: true, isUnpublished: false, needsChanges: false, isPublished: false, isSubmitted: false, bypass: false, show: true },
  { name: "unpublished", isDraft: false, isUnpublished: true, needsChanges: false, isPublished: false, isSubmitted: false, bypass: true, show: true },
  { name: "needs changes", isDraft: false, isUnpublished: false, needsChanges: true, isPublished: false, isSubmitted: false, bypass: false, show: true },
  { name: "published", isDraft: false, isUnpublished: false, needsChanges: false, isPublished: true, isSubmitted: false, bypass: true, show: false },
  { name: "submitted", isDraft: false, isUnpublished: false, needsChanges: false, isPublished: false, isSubmitted: true, bypass: false, show: false },
];
const noop = () => {};
for (const state of actionStates) {
  assert.equal(
    shouldShowProductActionsError(state),
    state.show,
    `shouldShowProductActionsError ${state.name}`,
  );
  const html = renderToStaticMarkup(
    createElement(AuthorProductFormActions, {
      mode: "edit",
      busy: false,
      publishing: false,
      canEditPublicFields: true,
      canMutateContent: true,
      canBypassProductModeration: state.bypass,
      isPublished: state.isPublished,
      isUnpublished: state.isUnpublished,
      isDraft: state.isDraft,
      isSubmitted: state.isSubmitted,
      needsChanges: state.needsChanges,
      publishedAt: null,
      moderationStatus: "not_submitted",
      practiceId: "p1",
      publicPath: "/practice/a/b",
      publishPreviewPath: "/practice/a/b?preview=publish",
      deleteLockedAfterPaidPurchase: false,
      error: "Не удалось открыть предпросмотр: Укажите ссылку рекомендации.",
      onSaveDraft: noop,
      onUnpublish: noop,
      onStartEditing: noop,
      onOpenPublishPreview: noop,
      onPublish: noop,
      onSubmitForModeration: noop,
      onWithdrawFromModeration: noop,
      onDeleteProduct: noop,
    }),
  );
  assert.equal(
    html.includes("Укажите ссылку рекомендации."),
    state.show,
    `actions error rendering ${state.name}`,
  );
  if (state.show) {
    assert.match(html, /data-submit-issue/);
    assert.match(html, /role="alert"/);
  }
}

const promoHtml = renderToStaticMarkup(
  createElement(AuthorProductPostListenPromoSection, {
    promoEnabled: true,
    promoTitle: "Заголовок",
    promoText: "Текст",
    promoButtonText: "Кнопка",
    promoUrl: "http://max.ru",
    promoOpenInNewTab: true,
    error: "Укажите корректную безопасную ссылку.",
    busy: false,
    onPromoEnabledChange: noop,
    onPromoTitleChange: noop,
    onPromoTextChange: noop,
    onPromoButtonTextChange: noop,
    onPromoUrlChange: noop,
    onPromoOpenInNewTabChange: noop,
  }),
);
assert.match(promoHtml, /data-submit-issue/);
assert.match(promoHtml, /Укажите корректную безопасную ссылку\./);
const promoHtmlNoError = renderToStaticMarkup(
  createElement(AuthorProductPostListenPromoSection, {
    promoEnabled: false,
    promoTitle: "",
    promoText: "",
    promoButtonText: "",
    promoUrl: "",
    promoOpenInNewTab: false,
    busy: false,
    onPromoEnabledChange: noop,
    onPromoTitleChange: noop,
    onPromoTextChange: noop,
    onPromoButtonTextChange: noop,
    onPromoUrlChange: noop,
    onPromoOpenInNewTabChange: noop,
  }),
);
assert.doesNotMatch(promoHtmlNoError, /data-submit-issue/);

// 3. Form wiring for the established cause.
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const saveProductBody = functionBody(form, "async function saveProduct(): Promise<boolean>");
assert.equal(
  (saveProductBody.match(/return false/g) ?? []).length,
  1,
  "every saveProduct failure path records its reason via failSave",
);
assert.match(saveProductBody, /validatePromoRecommendation\(/);
assert.match(saveProductBody, /isPromoRecommendationErrorCode\(payload\.error\)/);
assert.match(
  saveProductBody,
  /setFieldErrors\(\{ \[fieldKey\]: fieldMessage \}\);\s*requestScrollToFirstSubmitIssue\(\);\s*return failSave\(fieldMessage\);/,
);

const previewBody = functionBody(form, "async function openPublishPreviewTab(): Promise<boolean>");
assert.match(
  previewBody,
  /if \(!saved\) \{\s*previewTab\?\.close\(\);[\s\S]*?setError\(\s*formatPreviewSaveFailureMessage\(lastSaveFailureReasonRef\.current\),?\s*\);\s*requestScrollToFirstSubmitIssue\(\);\s*return false;/,
  "preview save failure shows the reason and scrolls instead of a silent bounce",
);
assert.match(previewBody, /buildPracticePublishPreviewPath\(authorSlug, productSlug\)/);
assert.match(previewBody, /previewTab\.opener = null;/);

const publishBody = functionBody(form, "async function publishProduct()");
assert.match(publishBody, /if \(!saved\) \{\s*setError\(\s*lastSaveFailureReasonRef\.current \?\?/);

// 4. Independent-stage matrix: optional MP4 export never gates preview/publish
//    and preview/back/reload never starts, cancels or duplicates a render.
assert.deepEqual([...PRODUCT_VIDEO_EXPORT_STATES], [
  "none",
  "queued",
  "processing",
  "completed",
  "failed",
]);
for (const state of PRODUCT_VIDEO_EXPORT_STATES) {
  assert.equal(canOpenPreviewOrPublishDespiteVideoExport(state), true, state);
}

const videoCoupling = /video|render|mp4/i;
for (const [name, body] of [
  ["openPublishPreviewTab", previewBody],
  ["publishProduct", publishBody],
  ["saveProduct", saveProductBody],
] as const) {
  assert.doesNotMatch(body, videoCoupling, `${name} must not depend on MP4 export state`);
}

for (const rel of [
  "src/app/api/author/products/[id]/publish/route.ts",
  "src/lib/author-products/publish.ts",
  "src/lib/author-products/moderation.ts",
  "src/lib/products/publish-preview.ts",
]) {
  assert.doesNotMatch(
    read(rel),
    /product_video|product-video-export|video_render/i,
    `${rel} must not read MP4 export state`,
  );
}

const videoExport = read("src/components/author-dashboard/AuthorProductVideoExport.tsx");
const postCalls = videoExport.match(/method: "POST"/g) ?? [];
const createVideoBody = functionBody(videoExport, "async function createVideo(");
const uploadCoverBody = functionBody(videoExport, "async function uploadCover(");
assert.equal(postCalls.length, 2, "only cover upload and explicit createVideo POST");
assert.match(createVideoBody, /method: "POST"/);
assert.match(uploadCoverBody, /method: "POST"/);
assert.doesNotMatch(videoExport, /method: "DELETE"[\s\S]{0,80}\/video\//, "no render cancel");
const effectBodies = videoExport
  .split("useEffect(")
  .slice(1)
  .map((chunk) => chunk.slice(0, chunk.indexOf("}, [") + 1));
assert.ok(effectBodies.length >= 3);
for (const body of effectBodies) {
  assert.doesNotMatch(body, /createVideo\(|method: "POST"/, "mount/reload effects never enqueue a render");
}

console.log("author-product-publish-preview-flow-unit: ok");
