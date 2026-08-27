#!/usr/bin/env node

/**
 * Unit checks for admin support product diagnostics.
 * No network, no Supabase credentials, no mutations.
 *
 * Usage:
 *   npx tsx scripts/admin-support-diagnostics-unit.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateAuthorSubmitEligibility } from "../src/lib/admin/author-submit-eligibility.ts";
import { collectLayeredDiagnosticIssues } from "../src/lib/admin/product-diagnostics-shared.ts";
import {
  buildAdminUsersProfileSearchOr,
  isAdminExactUuid,
  isAdminProductSlugQuery,
  shouldLookupUsersByProduct,
} from "../src/lib/admin/users-search.ts";
import {
  PLATFORM_ROLE_PERMISSIONS,
  resolvePermissionsForRoles,
} from "../src/lib/auth/platform-permissions.ts";
import {
  evaluateDatabaseModerationReady,
  isReadyForModerationSubmit,
} from "../src/lib/author-products/database-moderation-ready.ts";
import { evaluatePublishReadiness } from "../src/lib/author-products/publish.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function basePractice(overrides = {}) {
  return coercePracticeRow({
    id: "11111111-1111-4111-8111-111111111111",
    author_id: "22222222-2222-4222-8222-222222222222",
    title: "Готовый черновик",
    slug: "gotovyi-chernovik",
    subtitle: null,
    description: "Описание продукта для модерации.",
    format: "Медитация",
    product_kind: "practice",
    publication_class: "practice",
    music_usage_permission: null,
    duration_minutes: 2,
    price: 0,
    is_free: true,
    cover_url: "https://example.com/cover.jpg",
    use_shared_cover: true,
    audio_url: null,
    status: "draft",
    currency: "RUB",
    published_at: null,
    listening_notice_enabled: false,
    listening_notice_title: "",
    listening_notice_text: "",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  });
}

function baseAudio(overrides = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    practice_id: "11111111-1111-4111-8111-111111111111",
    title: "Трек 1",
    description: null,
    audio_path: "practices/a/audio.mp3",
    cover_url: null,
    duration_seconds: 120,
    original_file_name: "audio.mp3",
    file_size_bytes: 1000,
    position: 1,
    is_preview: false,
    status: "draft",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function readinessPair(practice, audioItems, options) {
  const tsReadiness = evaluatePublishReadiness(practice, audioItems, options);
  const dbReadiness = evaluateDatabaseModerationReady({
    practice,
    audioItems,
    accessStatus: options.accessStatus,
    activeTopicCount: options.activeTopicCount,
  });
  return {
    tsReadiness,
    dbReadiness,
    canSubmit: isReadyForModerationSubmit({
      tsReady: tsReadiness.ok,
      dbReady: dbReadiness.ok,
    }),
  };
}

// Search helpers
assert.equal(isAdminExactUuid("11111111-1111-4111-8111-111111111111"), true);
assert.equal(isAdminExactUuid("not-a-uuid"), false);
assert.equal(isAdminProductSlugQuery("gotovyi-chernovik"), true);
assert.equal(isAdminProductSlugQuery("Hello World"), false);
assert.equal(shouldLookupUsersByProduct("sergey@example.com"), false);
assert.equal(shouldLookupUsersByProduct("gotovyi-chernovik"), true);

const uuid = "11111111-1111-4111-8111-111111111111";
const searchOr = buildAdminUsersProfileSearchOr({
  search: uuid,
  extraUserIds: ["22222222-2222-4222-8222-222222222222"],
});
assert.match(searchOr, /full_name\.ilike/);
assert.match(searchOr, /email\.ilike/);
assert.match(searchOr, new RegExp(`id\\.eq\\.${uuid}`));
assert.match(searchOr, /id\.in\.\(22222222-2222-4222-8222-222222222222\)/);

const nameSearch = buildAdminUsersProfileSearchOr({ search: "Сергей" });
assert.match(nameSearch, /full_name\.ilike\.%Сергей%/);
assert.doesNotMatch(nameSearch, /id\.eq\./);

// Permissions: support can use the tool, analyst/editor cannot
assert.ok(PLATFORM_ROLE_PERMISSIONS.support.includes("users.view"));
assert.ok(!PLATFORM_ROLE_PERMISSIONS.support.includes("author_products.moderate"));
assert.ok(!PLATFORM_ROLE_PERMISSIONS.analyst.includes("users.view"));
assert.ok(!PLATFORM_ROLE_PERMISSIONS.editor.includes("users.view"));
assert.ok(!resolvePermissionsForRoles(["analyst"]).has("users.view"));
assert.ok(resolvePermissionsForRoles(["support"]).has("users.view"));
assert.ok(resolvePermissionsForRoles(["admin"]).has("users.view"));

// Ready product
const ready = readinessPair(basePractice(), [baseAudio()], {
  accessStatus: "free",
  activeTopicCount: 1,
});
assert.equal(ready.tsReadiness.ok, true, "ready product passes TS readiness");
assert.equal(ready.dbReadiness.ok, true, "ready product passes DB readiness");
assert.equal(ready.canSubmit, true, "ready product can submit");

// Failed readiness: missing cover / audio / topics
const missingCover = readinessPair(
  basePractice({ cover_url: null }),
  [baseAudio()],
  { accessStatus: "free", activeTopicCount: 1 },
);
assert.equal(missingCover.tsReadiness.ok, false);
assert.equal(
  missingCover.tsReadiness.requirements.find((item) => item.key === "cover")?.code,
  "missing_cover",
);
assert.equal(missingCover.canSubmit, false);

const missingAudio = readinessPair(basePractice(), [], {
  accessStatus: "free",
  activeTopicCount: 1,
});
assert.equal(missingAudio.tsReadiness.ok, false);
assert.equal(missingAudio.tsReadiness.firstFailure?.code, "missing_audio");
assert.ok(
  missingAudio.dbReadiness.checks.some(
    (check) => check.code === "missing_audio" && !check.ok,
  ),
);
assert.equal(missingAudio.canSubmit, false);

const missingTopics = readinessPair(basePractice(), [baseAudio()], {
  accessStatus: "free",
  activeTopicCount: 0,
});
assert.equal(missingTopics.tsReadiness.ok, false);
assert.equal(missingTopics.tsReadiness.firstFailure?.code, "topic_min_required");
assert.equal(missingTopics.canSubmit, false);

// Paid product without commercial eligibility
const paidFreeAuthor = readinessPair(
  basePractice({ is_free: false, price: 990 }),
  [baseAudio()],
  { accessStatus: "free", activeTopicCount: 1 },
);
assert.equal(paidFreeAuthor.tsReadiness.ok, false);
assert.equal(
  paidFreeAuthor.tsReadiness.requirements.find((item) => item.key === "price")
    ?.code,
  "paid_products_not_allowed",
);
assert.ok(
  paidFreeAuthor.dbReadiness.checks.some(
    (check) => check.code === "commercial_eligibility_required" && !check.ok,
  ),
);
assert.equal(paidFreeAuthor.canSubmit, false);

const paidEligibility = evaluateAuthorSubmitEligibility({
  status: "draft",
  moderationStatus: "not_submitted",
  canBypassProductModeration: false,
  accessStatus: "free",
  isFree: false,
  price: 990,
});
assert.equal(paidEligibility.action, "submit");
assert.equal(paidEligibility.enabled, true);
assert.equal(paidEligibility.commercialBlock?.code, "paid_products_not_allowed");
assert.match(paidEligibility.reason, /paid_products_not_allowed/);

// SQL-only issue must not produce false READY: invalid slug
const invalidSlug = readinessPair(
  basePractice({ slug: "Invalid Slug" }),
  [baseAudio()],
  { accessStatus: "free", activeTopicCount: 1 },
);
assert.equal(invalidSlug.tsReadiness.ok, true, "TS still accepts non-canonical slug");
assert.equal(invalidSlug.dbReadiness.ok, false);
assert.ok(
  invalidSlug.dbReadiness.checks.some(
    (check) => check.code === "invalid_slug" && !check.ok,
  ),
);
assert.equal(invalidSlug.canSubmit, false, "combined ready must stay false");

// SQL-only: currency
const usd = readinessPair(basePractice({ currency: "USD" }), [baseAudio()], {
  accessStatus: "free",
  activeTopicCount: 1,
});
assert.equal(usd.tsReadiness.ok, true);
assert.equal(usd.dbReadiness.ok, false);
assert.equal(usd.canSubmit, false);

// SQL-only: course with lessons/blocks and no flat audio
const courseNoAudio = readinessPair(
  basePractice({
    publication_class: "course",
    title: "Курс без плоского аудио",
    slug: "kurs-bez-audio",
  }),
  [],
  {
    accessStatus: "free",
    activeTopicCount: 1,
    courseContent: { lessonCount: 1, blockCount: 1 },
  },
);
assert.equal(
  courseNoAudio.tsReadiness.ok,
  true,
  "TS skips flat audio for a course with blocks",
);
assert.ok(
  courseNoAudio.dbReadiness.checks.some(
    (check) => check.code === "missing_audio" && !check.ok,
  ),
);
assert.equal(courseNoAudio.canSubmit, false);

// Submit UI eligibility
const submitted = evaluateAuthorSubmitEligibility({
  status: "draft",
  moderationStatus: "submitted",
  canBypassProductModeration: false,
  accessStatus: "free",
  isFree: true,
  price: 0,
});
assert.equal(submitted.action, "hidden");
assert.match(submitted.reason, /submitted/);

const bypassDraft = evaluateAuthorSubmitEligibility({
  status: "draft",
  moderationStatus: "not_submitted",
  canBypassProductModeration: true,
  accessStatus: "free",
  isFree: true,
  price: 0,
});
assert.equal(bypassDraft.action, "publish");

const suspended = evaluateAuthorSubmitEligibility({
  status: "draft",
  moderationStatus: "not_submitted",
  canBypassProductModeration: false,
  accessStatus: "suspended",
  isFree: true,
  price: 0,
});
assert.equal(suspended.action, "disabled");
assert.equal(suspended.canEditPublicFields, false);

const layered = collectLayeredDiagnosticIssues({
  submitEligibility: paidEligibility,
  tsReadiness: paidFreeAuthor.tsReadiness,
  dbReadiness: paidFreeAuthor.dbReadiness,
});
assert.ok(layered.some((issue) => issue.layer === "client"));
assert.ok(layered.some((issue) => issue.layer === "server"));
assert.ok(
  layered.some(
    (issue) =>
      issue.code === "paid_products_not_allowed" ||
      issue.code === "commercial_eligibility_required",
  ),
);

// Source guards
const usersPage = read("src/app/(platform)/admin/users/page.tsx");
assert.match(usersPage, /requireAdminPermission\("users\.view"\)/);

const usersTable = read("src/components/admin/AdminUsersTable.tsx");
assert.match(usersTable, /\/admin\/users\/\$\{user\.id\}/);
assert.match(usersTable, /UUID или адрес продукта/);

const queries = read("src/lib/admin/queries.ts");
assert.match(queries, /buildAdminUsersProfileSearchOr/);
assert.match(queries, /findUserIdsByProductQuery/);
assert.match(queries, /author_members/);
assert.match(queries, /user_practices/);
assert.match(queries, /from\("practices"\)/);

const userDetailQuery = read("src/lib/admin/user-detail.ts");
assert.match(userDetailQuery, /from\("author_members"\)/);
assert.match(userDetailQuery, /from\("practices"\)/);
assert.doesNotMatch(userDetailQuery, /user_practices/);
assert.match(userDetailQuery, /\.is\("deleted_at", null\)/);
assert.doesNotMatch(userDetailQuery, /moderation_status.*,\s*"submitted"/);
assert.doesNotMatch(userDetailQuery, /\.eq\("status", "published"\)/);

const userDetailPage = read("src/app/(platform)/admin/users/[userId]/page.tsx");
assert.match(userDetailPage, /requireAdminPermission\("users\.view"\)/);
assert.match(userDetailPage, /getAdminUserDetail/);
assert.match(userDetailPage, /Диагностика/);
assert.match(userDetailPage, /draft/);
assert.match(userDetailPage, /not_submitted/);
assert.doesNotMatch(userDetailPage, /impersonat/i);
assert.doesNotMatch(userDetailPage, /actingUserId/);

const diagnosticsPage = read(
  "src/app/(platform)/admin/products/[productId]/diagnostics/page.tsx",
);
assert.match(diagnosticsPage, /requireAdminPermission\("users\.view"\)/);
assert.match(diagnosticsPage, /getAdminProductDiagnostics/);
assert.match(diagnosticsPage, /evaluatePublishReadiness/);
assert.match(diagnosticsPage, /Можно отправлять на модерацию/);
assert.match(diagnosticsPage, /Database submission checks/);
assert.match(diagnosticsPage, /Только чтение/);
assert.doesNotMatch(diagnosticsPage, /approveAndPublishPractice/);
assert.doesNotMatch(diagnosticsPage, /submit-for-moderation/);
assert.doesNotMatch(diagnosticsPage, /impersonat/i);
assert.doesNotMatch(diagnosticsPage, /createBrowserClient/);

const diagnosticsShared = read("src/lib/admin/product-diagnostics-shared.ts");
assert.match(diagnosticsShared, /collectLayeredDiagnosticIssues/);

const diagnosticsQuery = read("src/lib/admin/product-diagnostics.ts");
assert.match(diagnosticsQuery, /createServiceRoleClient/);
assert.match(diagnosticsQuery, /evaluatePublishReadiness/);
assert.match(diagnosticsQuery, /evaluateDatabaseModerationReady/);
assert.match(diagnosticsQuery, /evaluateAuthorSubmitEligibility/);
assert.doesNotMatch(diagnosticsQuery, /submit_practice_for_moderation/);
assert.doesNotMatch(diagnosticsQuery, /approve_and_publish_practice/);
assert.doesNotMatch(diagnosticsQuery, /from\("user_practices"\)/);

const adminLayout = read("src/app/(platform)/admin/layout.tsx");
assert.match(adminLayout, /requireAdminPanelAccess/);

const guard = read("src/lib/admin/guard.ts");
assert.match(guard, /supabase\.auth\.getUser\(\)/);
assert.doesNotMatch(guard, /getSession\(\)/);

const queue = read("src/lib/admin/product-moderation-queries.ts");
assert.match(queue, /case "submitted"/);
assert.match(queue, /case "changes_requested"/);
assert.match(queue, /case "published"/);
assert.match(queue, /case "unpublished"/);
assert.doesNotMatch(queue, /case "not_submitted"/);
assert.doesNotMatch(queue, /case "draft"/);

const queuePage = read("src/app/(platform)/admin/product-moderation/page.tsx");
assert.match(queuePage, /requireAdminPermission\("author_products\.moderate"\)/);
assert.match(queuePage, /listAdminProductModerationQueue/);

const dbReady = read("src/lib/author-products/database-moderation-ready.ts");
assert.match(dbReady, /assert_practice_moderation_ready/);
assert.match(dbReady, /invalid_slug/);
assert.match(dbReady, /invalid_currency/);
assert.match(dbReady, /missing_audio/);

console.log("admin-support-diagnostics-unit: ok");
