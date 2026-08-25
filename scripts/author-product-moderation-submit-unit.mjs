#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCT_UNDER_MODERATION_MESSAGE,
  VISIBLE_AUTHOR_PRODUCT_STATUS,
  assertPracticeNotUnderModeration,
  canSubmitPracticeForModeration,
  canWithdrawPracticeFromModeration,
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusLabel,
  isPracticeUnderModerationError,
} from "../src/lib/author-products/moderation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

// 1. Visible status mapper
assert.equal(
  getVisibleAuthorProductStatus({
    status: "draft",
    moderationStatus: "not_submitted",
  }),
  VISIBLE_AUTHOR_PRODUCT_STATUS.DRAFT,
);
assert.equal(
  getVisibleAuthorProductStatus({
    status: "draft",
    moderationStatus: "submitted",
  }),
  VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED,
);
assert.equal(
  getVisibleAuthorProductStatus({
    status: "unpublished",
    moderationStatus: "submitted",
  }),
  VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED,
);
assert.equal(
  getVisibleAuthorProductStatus({
    status: "draft",
    moderationStatus: "changes_requested",
  }),
  VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED,
);
assert.equal(
  getVisibleAuthorProductStatus({
    status: "published",
    moderationStatus: "approved",
  }),
  VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED,
);
assert.equal(
  getVisibleAuthorProductStatus({
    status: "unpublished",
    moderationStatus: "approved",
  }),
  VISIBLE_AUTHOR_PRODUCT_STATUS.UNPUBLISHED,
);
assert.equal(
  getVisibleAuthorProductStatusLabel("submitted"),
  "На модерации",
);
assert.equal(
  getVisibleAuthorProductStatusLabel("changes_requested"),
  "Требуются изменения",
);
assert.notEqual(
  getVisibleAuthorProductStatusLabel("unpublished"),
  "В архиве",
);

// 2. Submit / withdraw predicates
assert.equal(
  canSubmitPracticeForModeration({
    status: "draft",
    moderationStatus: "not_submitted",
  }),
  true,
);
assert.equal(
  canSubmitPracticeForModeration({
    status: "draft",
    moderationStatus: "changes_requested",
  }),
  true,
);
assert.equal(
  canSubmitPracticeForModeration({
    status: "draft",
    moderationStatus: "submitted",
  }),
  false,
);
assert.equal(
  canSubmitPracticeForModeration({
    status: "draft",
    moderationStatus: "not_submitted",
    deletedAt: "2026-07-30T00:00:00Z",
  }),
  false,
);
assert.equal(
  canWithdrawPracticeFromModeration({ moderationStatus: "submitted" }),
  true,
);
assert.equal(
  canWithdrawPracticeFromModeration({ moderationStatus: "not_submitted" }),
  false,
);

// 3. Submitted lock helper
assert.throws(
  () => assertPracticeNotUnderModeration("submitted"),
  (error) =>
    isPracticeUnderModerationError(error) &&
    error.userMessage === PRODUCT_UNDER_MODERATION_MESSAGE,
);
assert.doesNotThrow(() => assertPracticeNotUnderModeration("not_submitted"));

// 4. Source guards — UI / API / RPC
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /Отправить на модерацию/);
assert.match(form, /Повторно отправить на модерацию/);
assert.match(form, /Отозвать с модерации/);
assert.match(form, /submit-for-moderation/);
assert.match(form, /withdraw-from-moderation/);
assert.doesNotMatch(form, /Переместить в архив/);
assert.doesNotMatch(form, /Вернуть из архива/);
assert.doesNotMatch(form, /В архиве/);
assert.doesNotMatch(form, /archiveProduct/);
assert.match(form, /canBypassProductModeration/);
assert.match(form, /Опубликовать/);

const dashboard = read(
  "src/components/author-dashboard/AuthorDashboardClient.tsx",
);
assert.doesNotMatch(dashboard, /Архив/);
assert.doesNotMatch(dashboard, /listView/);
assert.match(dashboard, /getVisibleAuthorProductStatus/);
assert.match(dashboard, /moderation_review_comment/);

const submitRoute = read(
  "src/app/api/author/products/[id]/submit-for-moderation/route.ts",
);
assert.match(submitRoute, /evaluatePublishReadiness/);
assert.match(submitRoute, /submitPracticeForModeration/);
assert.match(submitRoute, /requirements/);

const withdrawRoute = read(
  "src/app/api/author/products/[id]/withdraw-from-moderation/route.ts",
);
assert.match(withdrawRoute, /withdrawPracticeFromModeration/);

const patchRoute = read("src/app/api/author/products/[id]/route.ts");
assert.match(patchRoute, /assertPracticePublicContentEditable/);

const audioRoute = read("src/app/api/author/products/[id]/audio/route.ts");
assert.match(audioRoute, /assertPracticePublicContentEditable/);

const coverRoute = read("src/app/api/author/products/[id]/cover/route.ts");
assert.match(coverRoute, /assertPracticePublicContentEditable/);

const galleryRoute = read("src/app/api/author/products/[id]/gallery/route.ts");
assert.match(galleryRoute, /assertPracticePublicContentEditable/);
const gallerySlideRoute = read(
  "src/app/api/author/products/[id]/gallery/[slideId]/route.ts",
);
assert.match(gallerySlideRoute, /assertPracticePublicContentEditable/);

const topicsRoute = read("src/app/api/author/products/[id]/topics/route.ts");
assert.match(topicsRoute, /assertPracticePublicContentEditable/);

const schemaMigration = read(
  "supabase/migrations/20260731180000_practice_moderation_mvp_schema.sql",
);
assert.match(schemaMigration, /moderation_status/);
assert.match(schemaMigration, /can_bypass_product_moderation/);
assert.match(schemaMigration, /practice_moderation_events/);
assert.match(schemaMigration, /author_products\.moderate/);

const migration = read(
  "supabase/migrations/20260731181000_practice_moderation_mvp_gates_and_rpcs.sql",
);
assert.match(migration, /submit_practice_for_moderation/);
assert.match(migration, /withdraw_practice_from_moderation/);
assert.match(migration, /log_practice_moderation_event/);
assert.match(migration, /actor_type/);
assert.match(migration, /'submitted'/);
assert.match(migration, /'resubmitted'/);
assert.match(migration, /'submission_withdrawn'/);
assert.match(migration, /SET search_path = public, pg_temp/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.log_practice_moderation_event/,
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.submit_practice_for_moderation/,
);
// MVP intentionally omits email/outbox wrappers and eventId response fields.
assert.doesNotMatch(submitRoute, /moderationEventId/);
assert.doesNotMatch(submitRoute, /notifyAuthorProductModeration/);
assert.doesNotMatch(migration, /practice_moderation_email_outbox/);

const types = read("src/lib/author-products/types.ts");
assert.doesNotMatch(types, /В архиве/);
assert.match(types, /getVisibleAuthorProductStatus/);

console.log("author-product-moderation-submit-unit: ok");
