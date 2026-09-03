#!/usr/bin/env node

/**
 * Regression for 2026-08-28 draft-save incident.
 * Covers assignment policy, save error mapping, dirty/submit, payload,
 * and sibling-scan of other author-dashboard mutations.
 * No network, no Supabase credentials, no production SQL.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canConfigureProductAppreciation,
  resolveAppreciationOverridePatch,
} from "../src/lib/author-products/appreciation-override.ts";
import { evaluatePracticeAuthorAssignment } from "../src/lib/author-products/author-assignment.ts";
import {
  applyProductEditorSaveToDirty,
  isProductEditorDirty,
  nextProductEditorBaselineAfterSave,
  serializeProductEditorBaseline,
  shouldSubmitProductAfterSave,
} from "../src/lib/author-products/editor-save-state.ts";
import {
  buildListenerAppreciationOverrideField,
  buildUnlockedProductIdentityFields,
} from "../src/lib/author-products/save-payload.ts";
import {
  PRODUCT_SAVE_APPRECIATION_NOT_ELIGIBLE_MESSAGE,
  PRODUCT_SAVE_AUDIO_RELATION_MESSAGE,
  PRODUCT_SAVE_CONFLICT_MESSAGE,
  PRODUCT_SAVE_ERROR_FALLBACK,
  PRODUCT_SAVE_NETWORK_MESSAGE,
  PRODUCT_SAVE_PERMISSION_MESSAGE,
  PRODUCT_SAVE_SERVER_MESSAGE,
  PRODUCT_SAVE_SUPPORT_BLOCKED_MESSAGE,
  PRODUCT_SAVE_SUPPORT_SESSION_MESSAGE,
  PRODUCT_SAVE_VALIDATION_MESSAGE,
  classifyProductSaveError,
  getProductCreateErrorMessage,
  getProductSaveErrorMessage,
} from "../src/lib/author-products/save-errors.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const ACTING_AUTHOR_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_AUTHOR_ID = "55555555-5555-4555-8555-555555555555";

// --- Ordinary author assignment ---
assert.deepEqual(
  evaluatePracticeAuthorAssignment({
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: ACTING_AUTHOR_ID,
    isSupportMode: false,
    actingAuthorId: null,
    realUserRoleOnNextAuthor: "owner",
    actingUserRoleOnNextAuthor: null,
  }),
  { ok: true, assign: false },
);

assert.deepEqual(
  evaluatePracticeAuthorAssignment({
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: ACTING_AUTHOR_ID,
    isSupportMode: false,
    actingAuthorId: null,
    realUserRoleOnNextAuthor: null,
    actingUserRoleOnNextAuthor: null,
  }),
  { ok: true, assign: false },
  "same author_id is already authorized by practice access; do not re-check membership",
);

assert.deepEqual(
  evaluatePracticeAuthorAssignment({
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: OTHER_AUTHOR_ID,
    isSupportMode: false,
    actingAuthorId: null,
    realUserRoleOnNextAuthor: "editor",
    actingUserRoleOnNextAuthor: null,
  }),
  { ok: true, assign: true },
);

assert.deepEqual(
  evaluatePracticeAuthorAssignment({
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: OTHER_AUTHOR_ID,
    isSupportMode: false,
    actingAuthorId: null,
    realUserRoleOnNextAuthor: null,
    actingUserRoleOnNextAuthor: null,
  }),
  { ok: false, code: "forbidden" },
);

// --- Support mode: incident case — draft save sends author_id, admin is not a member ---
assert.deepEqual(
  evaluatePracticeAuthorAssignment({
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: ACTING_AUTHOR_ID,
    isSupportMode: true,
    actingAuthorId: ACTING_AUTHOR_ID,
    realUserRoleOnNextAuthor: null,
    actingUserRoleOnNextAuthor: "owner",
  }),
  { ok: true, assign: false },
  "support mode must allow unchanged author_id without real-admin membership",
);

assert.deepEqual(
  evaluatePracticeAuthorAssignment({
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: OTHER_AUTHOR_ID,
    isSupportMode: true,
    actingAuthorId: ACTING_AUTHOR_ID,
    realUserRoleOnNextAuthor: "owner",
    actingUserRoleOnNextAuthor: "owner",
  }),
  { ok: false, code: "forbidden" },
  "support mode cannot assign another author's product",
);

assert.deepEqual(
  evaluatePracticeAuthorAssignment({
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: OTHER_AUTHOR_ID,
    isSupportMode: false,
    actingAuthorId: null,
    realUserRoleOnNextAuthor: null,
    actingUserRoleOnNextAuthor: null,
  }),
  { ok: false, code: "forbidden" },
  "real admin without support mode cannot take another author's product",
);

// --- Payload: drafts send author_id; published/locked slugs do not ---
assert.deepEqual(
  buildUnlockedProductIdentityFields({
    slugLocked: false,
    authorId: ACTING_AUTHOR_ID,
    slug: "lavandovyy-son",
  }),
  { author_id: ACTING_AUTHOR_ID, slug: "lavandovyy-son" },
);
assert.deepEqual(
  buildUnlockedProductIdentityFields({
    slugLocked: true,
    authorId: ACTING_AUTHOR_ID,
    slug: "lavandovyy-son",
  }),
  {},
);

// --- Error mapping ---
assert.equal(classifyProductSaveError({ error: "invalid_request", status: 400 }), "validation");
assert.equal(classifyProductSaveError({ error: "title_too_long", status: 400 }), "validation");
assert.equal(classifyProductSaveError({ error: "forbidden", status: 403 }), "permission");
assert.equal(classifyProductSaveError({ error: "unauthorized", status: 401 }), "permission");
assert.equal(
  classifyProductSaveError({ error: "author_support_proof_missing", status: 403 }),
  "support_session",
);
assert.equal(
  classifyProductSaveError({ error: "support_session_expired", status: 403 }),
  "support_session",
);
assert.equal(
  classifyProductSaveError({ error: "support_mutation_blocked", status: 403 }),
  "support_blocked",
);
assert.equal(classifyProductSaveError({ error: "slug_taken", status: 409 }), "conflict");
assert.equal(
  classifyProductSaveError({ error: "audio_relation_failed", status: 500 }),
  "audio_relation",
);
assert.equal(classifyProductSaveError({ networkError: true }), "network");
assert.equal(classifyProductSaveError({ error: "internal_error", status: 500 }), "server");
assert.equal(
  classifyProductSaveError({ error: "appreciation_not_eligible", status: 400 }),
  "validation",
);
assert.equal(classifyProductSaveError({ error: "weird_unknown_code" }), "unknown");

assert.equal(
  getProductSaveErrorMessage({ error: "invalid_request", status: 400 }),
  PRODUCT_SAVE_VALIDATION_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ error: "forbidden", status: 403 }),
  PRODUCT_SAVE_PERMISSION_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ error: "author_support_proof_missing", status: 403 }),
  PRODUCT_SAVE_SUPPORT_SESSION_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ error: "support_mutation_blocked", status: 403 }),
  PRODUCT_SAVE_SUPPORT_BLOCKED_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ error: "slug_taken", status: 409 }),
  PRODUCT_SAVE_CONFLICT_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ error: "audio_relation_failed" }),
  PRODUCT_SAVE_AUDIO_RELATION_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ networkError: true }),
  PRODUCT_SAVE_NETWORK_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ error: "internal_error", status: 500 }),
  PRODUCT_SAVE_SERVER_MESSAGE,
);
assert.equal(
  getProductSaveErrorMessage({ error: "appreciation_not_eligible", status: 400 }),
  PRODUCT_SAVE_APPRECIATION_NOT_ELIGIBLE_MESSAGE,
);
assert.notEqual(
  getProductSaveErrorMessage({ error: "appreciation_not_eligible", status: 400 }),
  PRODUCT_SAVE_ERROR_FALLBACK,
);
assert.equal(
  getProductSaveErrorMessage({ error: "totally_unknown" }),
  PRODUCT_SAVE_ERROR_FALLBACK,
);
assert.equal(
  getProductSaveErrorMessage({
    error: "internal_error",
    message: "SELECT * FROM author_members WHERE auth.uid() = user_id",
  }),
  PRODUCT_SAVE_SERVER_MESSAGE,
);
assert.doesNotMatch(
  getProductSaveErrorMessage({ error: "forbidden" }),
  /author_members|auth\.uid|service_role|SELECT/i,
);
assert.equal(
  getProductCreateErrorMessage({ error: "forbidden", status: 403 }),
  PRODUCT_SAVE_PERMISSION_MESSAGE,
);

// --- Dirty / submit ---
assert.equal(applyProductEditorSaveToDirty({ dirty: true, saved: true }), false);
assert.equal(applyProductEditorSaveToDirty({ dirty: true, saved: false }), true);
assert.equal(applyProductEditorSaveToDirty({ dirty: false, saved: false }), false);
assert.equal(shouldSubmitProductAfterSave(true), true);
assert.equal(shouldSubmitProductAfterSave(false), false);

const form = {
  authorId: ACTING_AUTHOR_ID,
  title: "Лавандовый сон",
  subtitle: "",
  description: "",
  productKind: "practice",
  publicationClass: "practice",
  musicUsagePermission: null,
  formatPreset: "Медитация",
  customFormat: "",
  slug: "lavandovyy-son",
  isFree: true,
  price: 0,
  catalogVisibility: "listed",
  listeningNoticeEnabled: true,
  listeningNoticeTitle: "Как слушать",
  listeningNoticeText: "В наушниках",
  promoEnabled: false,
  promoTitle: "",
  promoText: "",
  promoButtonText: "",
  promoUrl: "",
  promoOpenInNewTab: false,
  seoPrimaryQuery: "",
  seoTitle: "",
  seoDescription: "",
};
const audio = [
  {
    id: "audio-1",
    title: "Трек",
    description: null,
    audio_path: "authors/a/practices/p/audio.mp3",
  },
];
const baseline = serializeProductEditorBaseline(form, audio);
assert.equal(isProductEditorDirty(baseline, baseline), false);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline({ ...form, title: "Новое название" }, audio),
    baseline,
  ),
  true,
);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline(
      { ...form, seoPrimaryQuery: "медитация для сна" },
      audio,
    ),
    baseline,
  ),
  true,
);
assert.equal(isProductEditorDirty(baseline, null), true);

const kept = nextProductEditorBaselineAfterSave({
  saved: false,
  currentBaseline: baseline,
  nextBaseline: "next",
});
assert.equal(kept, baseline);
const cleared = nextProductEditorBaselineAfterSave({
  saved: true,
  currentBaseline: baseline,
  nextBaseline: "next",
});
assert.equal(cleared, "next");

const replaceMp3 = serializeProductEditorBaseline(form, [
  { ...audio[0], audio_path: "authors/a/practices/p/audio-replaced.mp3" },
]);
assert.equal(isProductEditorDirty(replaceMp3, baseline), true);
assert.equal(
  applyProductEditorSaveToDirty({
    dirty: isProductEditorDirty(replaceMp3, baseline),
    saved: true,
  }),
  false,
);

// --- Source: PATCH no longer checks author_members for auth.uid() ---
const productPatch = read("src/app/api/author/products/[id]/route.ts");
assert.match(productPatch, /authorizePracticeAuthorAssignment/);
assert.doesNotMatch(
  productPatch,
  /\.from\("author_members"\)[\s\S]*\.eq\("user_id", user\.id\)/,
);
assert.doesNotMatch(productPatch, /INSERT INTO public\.author_members/);
assert.doesNotMatch(productPatch, /SET request\.jwt\.claim\.sub/);
assert.doesNotMatch(productPatch, /auth\.uid\(\)\s*=\s*acting_user_id/);
assert.doesNotMatch(productPatch, /SUPABASE_SERVICE_ROLE_KEY/);

const auth = read("src/lib/author-products/auth.ts");
assert.match(auth, /export async function authorizePracticeAuthorAssignment/);
assert.match(auth, /evaluatePracticeAuthorAssignment/);
assert.doesNotMatch(auth, /SET request\.jwt\.claim\.sub/);
assert.doesNotMatch(auth, /auth\.uid\(\)\s*=\s*acting_user_id/);
assert.match(auth, /author_support_proof_missing/);

const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(formSource, /getProductSaveErrorMessage/);
assert.match(formSource, /shouldSubmitProductAfterSave/);
assert.match(formSource, /buildUnlockedProductIdentityFields/);
assert.match(formSource, /savedBaselineRef/);
assert.match(formSource, /applyProductEditorSaveToDirty/);
assert.doesNotMatch(
  formSource,
  /payload\.error === "update_failed"[\s\S]*Не удалось сохранить аудиопродукт/,
);
assert.match(
  formSource,
  /async function saveDraft\(\) \{[\s\S]*?const saved = await saveProduct\(\);/,
  "Save draft still goes through saveProduct()",
);
assert.match(
  formSource,
  /const saved = await saveProduct\(\);[\s\S]*?previewTab\?\.close\(\)/,
  "Preview still goes through saveProduct()",
);
assert.match(
  formSource,
  /const saved = await saveProduct\(\);[\s\S]*if \(!shouldSubmitProductAfterSave\(saved\)\)/,
  "Submit for moderation still goes through saveProduct()",
);
assert.match(
  formSource,
  /buildProductSavePayload\(form, slugLocked, canConfigureAppreciation\)/,
);
assert.match(formSource, /buildListenerAppreciationOverrideField/);
assert.match(formSource, /canConfigureProductAppreciation/);
assert.doesNotMatch(
  formSource,
  /listener_appreciation_override:\s*form\.listenerAppreciationOverride/,
  "payload must not always include listener_appreciation_override",
);
assert.match(formSource, /logProductSaveFailure/);
assert.doesNotMatch(
  formSource,
  /seo_about: form\.seoAbout/,
  "ordinary save must omit seo_about so stored legacy values stay intact",
);
assert.match(
  productPatch,
  /if \("seo_about" in body\)/,
  "PATCH updates seo_about only when the key is present",
);

const audioUpload = read(
  "src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts",
);
assert.doesNotMatch(audioUpload, /"author_id" in body/);
assert.match(audioUpload, /requirePracticeMutationAccess/);

const createRoute = read("src/app/api/author/products/route.ts");
assert.match(createRoute, /requireAuthorMutationMembership\(authorId\)/);
assert.doesNotMatch(
  createRoute,
  /\.from\("author_members"\)[\s\S]*\.eq\("user_id", user\.id\)/,
);

const submitRoute = read(
  "src/app/api/author/products/[id]/submit-for-moderation/route.ts",
);
assert.match(submitRoute, /requirePracticeMutationAccess/);
assert.doesNotMatch(
  submitRoute,
  /\.from\("author_members"\)[\s\S]*user\.id/,
);

// --- Sibling scan: other author-dashboard forms must not repeat user.id membership ---
const siblingSupportAwareRoutes = [
  "src/app/api/author/profile/route.ts",
  "src/app/api/author/payout-profile/route.ts",
  "src/app/api/author/commercial-application/route.ts",
  "src/app/api/author/products/[id]/topics/route.ts",
  "src/app/api/author/products/[id]/cover/route.ts",
  "src/app/api/author/products/[id]/audio/[audioId]/route.ts",
];

for (const relativePath of siblingSupportAwareRoutes) {
  const source = read(relativePath);
  assert.doesNotMatch(
    source,
    /\.from\("author_members"\)[\s\S]{0,240}\.eq\("user_id", user\.id\)/,
    `${relativePath} must not re-check author_members with the real user.id`,
  );
  assert.match(
    source,
    /requireAuthorMembership|requireAuthorMutationMembership|requirePracticeMutationAccess|requirePracticeAccess/,
    `${relativePath} must use the support-aware access helper`,
  );
}

for (const relativePath of [
  "src/app/api/author/promotion/pages/route.ts",
  "src/app/api/author/promotion/offers/route.ts",
  "src/lib/promo-pages/pages-api.ts",
  "src/lib/quick-offers/offers-api.ts",
]) {
  const source = read(relativePath);
  assert.doesNotMatch(
    source,
    /\.from\("author_members"\)[\s\S]{0,240}\.eq\("user_id", user\.id\)/,
    `${relativePath} must not repeat the author_id-vs-real-admin membership check`,
  );
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const dashboardFiles = walk(path.join(root, "src/components/author-dashboard"));
for (const file of dashboardFiles) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    /from\("author_members"\)/,
    `${path.relative(root, file)} must not query author_members in the browser`,
  );
}

assert.match(
  productPatch,
  /resolveAppreciationOverridePatch/,
  "PATCH must use the extracted appreciation override helper",
);

const freePracticeEligible = {
  accessStatus: "free",
  isFree: true,
  productKind: "practice",
  publicationClass: "practice",
};
const commercialPracticeEligible = {
  accessStatus: "commercial_active",
  isFree: true,
  productKind: "practice",
  publicationClass: "practice",
};

assert.equal(canConfigureProductAppreciation(freePracticeEligible), false);
assert.equal(canConfigureProductAppreciation(commercialPracticeEligible), true);
assert.equal(
  canConfigureProductAppreciation({
    ...commercialPracticeEligible,
    productKind: "audio_post",
    publicationClass: "post",
  }),
  true,
);
assert.equal(
  canConfigureProductAppreciation({
    ...commercialPracticeEligible,
    isFree: false,
  }),
  false,
);
assert.equal(
  canConfigureProductAppreciation({
    ...commercialPracticeEligible,
    publicationClass: "course",
  }),
  false,
);
assert.equal(
  canConfigureProductAppreciation({
    ...commercialPracticeEligible,
    accessStatus: "commercial_onboarding",
  }),
  false,
);

// A. Free author PATCH without the key → omit / no 400
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: false,
    override: undefined,
    ...freePracticeEligible,
  }),
  { action: "omit" },
);

// B. Free author PATCH with null → stale-client no-op
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: true,
    override: null,
    ...freePracticeEligible,
  }),
  { action: "omit" },
);

// C. Free author PATCH with non-null override → reject
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: true,
    override: true,
    ...freePracticeEligible,
  }),
  { action: "reject", error: "appreciation_not_eligible" },
);
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: true,
    override: false,
    ...freePracticeEligible,
  }),
  { action: "reject", error: "appreciation_not_eligible" },
);

// D. Commercial active + eligible product: existing apply behavior
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: true,
    override: true,
    ...commercialPracticeEligible,
  }),
  { action: "apply", value: true },
);
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: true,
    override: false,
    ...commercialPracticeEligible,
  }),
  { action: "apply", value: false },
);
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: true,
    override: null,
    ...commercialPracticeEligible,
  }),
  { action: "apply", value: null },
);
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: false,
    override: undefined,
    ...commercialPracticeEligible,
  }),
  { action: "omit" },
);
assert.deepEqual(
  resolveAppreciationOverridePatch({
    present: true,
    override: "yes",
    ...commercialPracticeEligible,
  }),
  { action: "reject", error: "appreciation_not_eligible" },
);

// E / F. Product form payload includes the key only when appreciation is configurable
const omitted = buildListenerAppreciationOverrideField({
  canConfigureAppreciation: false,
  listenerAppreciationOverride: null,
});
assert.equal(
  Object.prototype.hasOwnProperty.call(omitted, "listener_appreciation_override"),
  false,
);
assert.deepEqual(omitted, {});

assert.deepEqual(
  buildListenerAppreciationOverrideField({
    canConfigureAppreciation: true,
    listenerAppreciationOverride: null,
  }),
  { listener_appreciation_override: null },
);
assert.deepEqual(
  buildListenerAppreciationOverrideField({
    canConfigureAppreciation: true,
    listenerAppreciationOverride: true,
  }),
  { listener_appreciation_override: true },
);
assert.deepEqual(
  buildListenerAppreciationOverrideField({
    canConfigureAppreciation: true,
    listenerAppreciationOverride: false,
  }),
  { listener_appreciation_override: false },
);

console.log("author-product-draft-save-unit: ok");
