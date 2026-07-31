#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  requiresPublishPreviewBeforePublish,
  shouldOpenPublishPreviewFromForm,
} from "../src/lib/products/publish-preview.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function extractAsyncFunction(source, name, nextName) {
  const startToken = `async function ${name}`;
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `missing async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.ok(end > start, `missing next async function ${nextName}`);
  return source.slice(start, end);
}

function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing block start: ${startMarker}`);
  const end = source.indexOf(endMarker, start + 1);
  assert.ok(end > start, `missing block end: ${endMarker}`);
  return source.slice(start, end);
}

function testBypassPreviewRoutingHelper() {
  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: null,
      canBypassProductModeration: true,
    }),
    false,
    "bypass draft publish must not open preview",
  );
  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: "",
      canBypassProductModeration: true,
    }),
    false,
    "bypass empty publishedAt still publishes directly",
  );
  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: "2026-07-01T10:00:00.000Z",
      canBypassProductModeration: true,
    }),
    false,
    "bypass republish publishes directly",
  );

  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: null,
      canBypassProductModeration: false,
    }),
    true,
    "ordinary first publish still routes through preview when form publish is used",
  );
  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: "2026-07-01T10:00:00.000Z",
      canBypassProductModeration: false,
    }),
    false,
    "ordinary republish with publishedAt publishes directly",
  );

  assert.equal(requiresPublishPreviewBeforePublish(null), true);
  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: null,
      canBypassProductModeration: true,
    }),
    false,
  );
}

function testPublishProductDirectFlow() {
  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  const publishFn = extractAsyncFunction(
    form,
    "publishProduct",
    "unpublishProduct",
  );
  const openPreviewFn = extractAsyncFunction(
    form,
    "openPublishPreviewTab",
    "publishProduct",
  );

  assert.match(
    publishFn,
    /shouldOpenPublishPreviewFromForm\(\{\s*publishedAt: form\.publishedAt,\s*canBypassProductModeration,/,
    "publishProduct uses bypass-aware preview gate",
  );
  assert.match(
    publishFn,
    /if \(publishInFlightRef\.current\) \{\s*return;/,
    "double-click guard blocks re-entry",
  );
  assert.match(
    publishFn,
    /const saved = await saveProduct\(\);/,
    "publish saves current form first",
  );
  assert.match(
    publishFn,
    /if \(!saved\) \{\s*return;/,
    "failed save does not call publish API",
  );

  const saveIdx = publishFn.indexOf("const saved = await saveProduct()");
  const publishFetchIdx = publishFn.indexOf(
    "`/api/author/products/${id}/publish`",
  );
  assert.ok(
    saveIdx >= 0 && publishFetchIdx > saveIdx,
    "publish API is called only after save",
  );

  assert.match(
    publishFn,
    /fetch\(`\/api\/author\/products\/\$\{id\}\/publish`, \{\s*method: "POST",/,
    "bypass publish hits existing publish endpoint",
  );

  const previewGateIdx = publishFn.indexOf("shouldOpenPublishPreviewFromForm");
  const previewOpenIdx = publishFn.indexOf("await openPublishPreviewTab()");
  const directPublishIdx = publishFn.indexOf(
    "`/api/author/products/${id}/publish`",
  );
  assert.ok(previewGateIdx >= 0 && previewOpenIdx > previewGateIdx);
  assert.ok(
    directPublishIdx > previewOpenIdx,
    "direct publish path is after the optional preview early-return",
  );

  // When bypass gate returns false, code must not require preview navigation
  // before the publish fetch (preview open is only in the early-return branch).
  const afterGate = publishFn.slice(previewOpenIdx + "await openPublishPreviewTab()".length);
  assert.equal(
    afterGate.includes("openPublishPreviewTab()"),
    false,
    "direct publish path does not navigate to publish-preview",
  );

  assert.match(publishFn, /isPublishNotReadyResponse\(payload\)/);
  assert.match(publishFn, /PUBLISH_PREVIEW_NOT_READY_MESSAGE/);

  const notOkIdx = publishFn.indexOf("if (!response.ok)");
  const replaceIdx = publishFn.indexOf("window.location.replace(");
  assert.ok(
    notOkIdx >= 0 && replaceIdx > notOkIdx,
    "success redirect runs only after response.ok check",
  );
  assert.match(
    publishFn,
    /window\.location\.replace\(\s*buildPracticePublicPath\(authorSlug, productSlug\)/,
    "success publish redirects to publicPath",
  );
  assert.match(
    publishFn,
    /setError\(payload\.message \?\? "Не удалось опубликовать аудиопродукт\."\)/,
    "publish error stays on form",
  );

  assert.match(openPreviewFn, /buildPracticePublishPreviewPath/);
  assert.doesNotMatch(
    openPreviewFn,
    /\/publish`,/,
    "Preview button path does not call publish API",
  );
}

function testFormCtaWiring() {
  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");

  const bypassBlock = extractBlock(
    form,
    "{isDraft && canBypassProductModeration ? (",
    "{isDraft && !canBypassProductModeration ? (",
  );
  assert.match(
    bypassBlock,
    /onClick=\{\(\) => void openPublishPreviewTab\(\)\}/,
    "Preview button opens preview navigation",
  );
  assert.match(
    bypassBlock,
    /onClick=\{\(\) => void publishProduct\(\)\}/,
    "bypass Publish button calls publishProduct",
  );
  assert.match(bypassBlock, /\{publishing \? "Публикуем…" : "Опубликовать"\}/);
  assert.match(bypassBlock, /disabled=\{busy \|\| publishing \|\| !canMutateContent\}/);
  assert.doesNotMatch(
    bypassBlock,
    /submitForModeration/,
    "bypass draft CTA does not submit for moderation",
  );

  const ordinaryBlock = extractBlock(
    form,
    "{isDraft && !canBypassProductModeration ? (",
    "{needsChanges ? (",
  );
  assert.match(
    ordinaryBlock,
    /onClick=\{\(\) => void submitForModeration\(\)\}/,
    "ordinary author uses submit-for-moderation",
  );
  assert.match(ordinaryBlock, /Отправить на модерацию/);
  assert.doesNotMatch(
    ordinaryBlock,
    /void publishProduct\(\)/,
    "ordinary draft does not call publishProduct",
  );
  assert.match(
    ordinaryBlock,
    /onClick=\{\(\) => void openPublishPreviewTab\(\)\}/,
    "ordinary Preview still opens preview",
  );

  assert.match(form, /isPublished \? \(/);
  const publishedBlock = extractBlock(
    form,
    "{isPublished ? (",
    "{isUnpublished ? (",
  );
  assert.doesNotMatch(
    publishedBlock,
    /Опубликовать/,
    "published product has no first-publish button",
  );
  assert.doesNotMatch(publishedBlock, /void publishProduct\(\)/);
}

testBypassPreviewRoutingHelper();
testPublishProductDirectFlow();
testFormCtaWiring();

console.log("author-product-bypass-publish-unit: ok");
