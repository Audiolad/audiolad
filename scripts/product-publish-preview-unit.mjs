#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPracticeAccessPresentation,
  resolvePublishPreviewListenerAccess,
} from "../src/lib/products/practice-access-ui.ts";
import {
  buildPracticePublishListenerPreviewPath,
  buildPracticePublishPreviewPath,
} from "../src/lib/products/paths.ts";
import {
  canActivatePublishListenerViewMode,
  canActivatePublishPreviewMode,
  canPublishFromPublishPreview,
  isPublishListenerViewQuery,
  isPublishNotReadyResponse,
  isPublishPreviewQuery,
  PUBLISH_PREVIEW_NOT_READY_MESSAGE,
  requiresPublishPreviewBeforePublish,
  shouldIndexPracticePage,
  shouldOpenPublishPreviewFromForm,
  shouldTrackPracticeListenerAnalytics,
} from "../src/lib/products/publish-preview.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function memberAccess(overrides = {}) {
  return {
    canListen: true,
    canAcquire: false,
    isPubliclyListed: false,
    reason: "author_owner",
    isAuthorMember: true,
    accessSource: null,
    hasEntitlement: false,
    ...overrides,
  };
}

function guestAccess() {
  return {
    canListen: false,
    canAcquire: false,
    isPubliclyListed: false,
    reason: "not_authenticated",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
  };
}

function otherWorkspaceAccess() {
  return {
    canListen: false,
    canAcquire: false,
    isPubliclyListed: false,
    reason: "payment_required",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
  };
}

function basePractice(overrides = {}) {
  return {
    id: "practice-1",
    slug: "praktika",
    price: 0,
    is_free: true,
    format: "Медитация",
    status: "draft",
    is_catalog_listed: false,
    guest_access_enabled: false,
    audio_url: "https://cdn.example/audio.mp3",
    ...overrides,
  };
}

function testPathsHelper() {
  assert.equal(
    buildPracticePublishPreviewPath("anna", "praktika"),
    "/practice/anna/praktika?preview=publish",
  );
  assert.equal(
    buildPracticePublishListenerPreviewPath("anna", "praktika"),
    "/practice/anna/praktika?preview=publish&view=listener",
  );
  assert.equal(isPublishPreviewQuery("publish"), true);
  assert.equal(isPublishPreviewQuery("buyer"), false);
  assert.equal(isPublishListenerViewQuery("listener"), true);
  assert.equal(isPublishListenerViewQuery("buyer"), false);
}

function testFirstPublishGate() {
  assert.equal(requiresPublishPreviewBeforePublish(null), true);
  assert.equal(requiresPublishPreviewBeforePublish(""), true);
  assert.equal(requiresPublishPreviewBeforePublish("   "), true);
  assert.equal(
    requiresPublishPreviewBeforePublish("2026-07-01T10:00:00.000Z"),
    false,
  );

  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: null,
      canBypassProductModeration: true,
    }),
    false,
    "bypass authors skip form publish-preview gate",
  );
  assert.equal(
    shouldOpenPublishPreviewFromForm({
      publishedAt: null,
      canBypassProductModeration: false,
    }),
    true,
    "non-bypass first publish still uses preview when form publish is invoked",
  );
}

function testActivationRbac() {
  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "draft",
      access: memberAccess(),
    }),
    true,
    "workspace member with publish-capable membership can open preview",
  );

  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "draft",
      access: guestAccess(),
    }),
    false,
    "guest cannot activate publish preview",
  );

  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "draft",
      access: otherWorkspaceAccess(),
    }),
    false,
    "member of another workspace cannot activate publish preview",
  );

  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "published",
      access: memberAccess(),
    }),
    false,
    "published + ?preview=publish must not enable draft preview mode",
  );

  assert.equal(
    canPublishFromPublishPreview(memberAccess()),
    true,
    "owner/editor membership can publish (same gate as practice ownership)",
  );
  assert.equal(
    canPublishFromPublishPreview(guestAccess()),
    false,
    "non-member has no publish button",
  );

  // Current RBAC: author_members owner|editor both resolve as isAuthorMember /
  // reason author_owner. There is no separate member role without publish right.
  assert.equal(
    canPublishFromPublishPreview(
      memberAccess({ reason: "author_owner", isAuthorMember: true }),
    ),
    true,
    "editor-equivalent membership keeps publish (no stricter owner-only rule)",
  );

  assert.equal(
    canActivatePublishListenerViewMode({
      previewParam: "publish",
      viewParam: "listener",
      practiceStatus: "draft",
      access: memberAccess(),
    }),
    true,
    "workspace member can open draft listener-view",
  );

  assert.equal(
    canActivatePublishListenerViewMode({
      previewParam: "publish",
      viewParam: "listener",
      practiceStatus: "draft",
      access: guestAccess(),
    }),
    false,
    "guest cannot activate draft listener-view via URL",
  );

  assert.equal(
    canActivatePublishListenerViewMode({
      previewParam: "publish",
      viewParam: "listener",
      practiceStatus: "draft",
      access: otherWorkspaceAccess(),
    }),
    false,
    "other author cannot activate draft listener-view",
  );

  assert.equal(
    canActivatePublishListenerViewMode({
      previewParam: "publish",
      viewParam: undefined,
      practiceStatus: "draft",
      access: memberAccess(),
    }),
    false,
    "publish preview without view=listener stays in author preview",
  );

  assert.equal(
    canActivatePublishListenerViewMode({
      previewParam: "buyer",
      viewParam: "listener",
      practiceStatus: "draft",
      access: memberAccess(),
    }),
    false,
    "listener view requires preview=publish gate",
  );

  assert.equal(
    canActivatePublishListenerViewMode({
      previewParam: "publish",
      viewParam: "listener",
      practiceStatus: "published",
      access: memberAccess(),
    }),
    false,
    "published product must not activate draft listener-view",
  );
}

function testSeoAndAnalyticsGuards() {
  assert.equal(shouldIndexPracticePage("published"), true);
  assert.equal(shouldIndexPracticePage("published", true), true);
  assert.equal(shouldIndexPracticePage("published", false), false);
  assert.equal(shouldIndexPracticePage("draft"), false);
  assert.equal(shouldIndexPracticePage("unpublished"), false);
  assert.equal(shouldIndexPracticePage("archived"), false);

  assert.equal(
    shouldTrackPracticeListenerAnalytics({
      practiceStatus: "published",
      publishPreviewMode: false,
    }),
    true,
  );
  assert.equal(
    shouldTrackPracticeListenerAnalytics({
      practiceStatus: "draft",
      publishPreviewMode: true,
    }),
    false,
  );
  assert.equal(
    shouldTrackPracticeListenerAnalytics({
      practiceStatus: "draft",
      publishPreviewMode: false,
    }),
    false,
  );
  assert.equal(
    shouldTrackPracticeListenerAnalytics({
      practiceStatus: "published",
      publishPreviewMode: true,
    }),
    false,
  );
}

function testListenerIdenticalPresentation() {
  const freePresentation = buildPracticeAccessPresentation({
    access: memberAccess(),
    practice: basePractice(),
    authorSlug: "anna",
    paymentsConfigured: true,
    isAuthenticated: true,
    publishPreviewMode: true,
  });

  assert.equal(freePresentation.showPublishPreviewBanner, true);
  assert.equal(freePresentation.showAuthorToolbar, false);
  assert.equal(freePresentation.showBuyerPreviewBanner, false);
  assert.equal(freePresentation.showBuyerPreviewExit, false);
  assert.equal(freePresentation.showAdminPreview, false);
  assert.equal(freePresentation.canPublishFromPreview, true);
  assert.equal(freePresentation.primaryAction.kind, "listen");
  assert.match(freePresentation.statusBadge, /без оплаты/i);

  const paidPresentation = buildPracticeAccessPresentation({
    access: memberAccess(),
    practice: basePractice({
      is_free: false,
      price: 490,
      audio_url: "https://cdn.example/audio.mp3",
    }),
    authorSlug: "anna",
    paymentsConfigured: true,
    isAuthenticated: true,
    publishPreviewMode: true,
  });

  assert.equal(paidPresentation.showAuthorToolbar, false);
  assert.equal(paidPresentation.primaryAction.kind, "buy");
  assert.equal(paidPresentation.statusBadge.includes("Недоступно"), false);

  const incompleteDraftAccess = resolvePublishPreviewListenerAccess(
    memberAccess(),
    basePractice({ is_free: true, audio_url: null }),
  );
  assert.equal(incompleteDraftAccess.reason, "free");
}

function testDraftListenerViewPresentation() {
  const freeListenerView = buildPracticeAccessPresentation({
    access: memberAccess(),
    practice: basePractice(),
    authorSlug: "anna",
    paymentsConfigured: true,
    isAuthenticated: true,
    publishPreviewMode: true,
    publishListenerViewMode: true,
  });

  assert.equal(freeListenerView.showPublishPreviewBanner, false);
  assert.equal(freeListenerView.showBuyerPreviewExit, true);
  assert.equal(freeListenerView.showAuthorToolbar, false);
  assert.equal(freeListenerView.showAdminPreview, false);
  assert.equal(freeListenerView.canPublishFromPreview, false);
  assert.equal(freeListenerView.primaryAction.kind, "listen");
  assert.match(freeListenerView.statusBadge, /без оплаты/i);

  const paidListenerView = buildPracticeAccessPresentation({
    access: memberAccess(),
    practice: basePractice({
      is_free: false,
      price: 490,
      audio_url: "https://cdn.example/audio.mp3",
    }),
    authorSlug: "anna",
    paymentsConfigured: true,
    isAuthenticated: true,
    publishPreviewMode: true,
    publishListenerViewMode: true,
  });

  assert.equal(paidListenerView.showPublishPreviewBanner, false);
  assert.equal(paidListenerView.showBuyerPreviewExit, true);
  assert.equal(paidListenerView.primaryAction.kind, "buy");
  assert.equal(paidListenerView.statusBadge.includes("Недоступно"), false);

  // Without publishListenerViewMode, author banner stays; exit stays hidden.
  const authorPublishPreview = buildPracticeAccessPresentation({
    access: memberAccess(),
    practice: basePractice(),
    authorSlug: "anna",
    paymentsConfigured: true,
    isAuthenticated: true,
    publishPreviewMode: true,
    publishListenerViewMode: false,
  });
  assert.equal(authorPublishPreview.showPublishPreviewBanner, true);
  assert.equal(authorPublishPreview.showBuyerPreviewExit, false);
}

function testStructuredNotReady() {
  assert.equal(
    isPublishNotReadyResponse({ publishReady: false, error: "missing_cover" }),
    true,
  );
  assert.equal(
    isPublishNotReadyResponse({ error: "publish_not_ready" }),
    true,
  );
  assert.equal(
    isPublishNotReadyResponse({ error: "internal_error" }),
    false,
  );
  assert.equal(
    PUBLISH_PREVIEW_NOT_READY_MESSAGE,
    "Продукт пока не готов к публикации",
  );
}

function testSourceContracts() {
  const page = read("src/app/(listener)/practice/[...segments]/page.tsx");
  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  const banner = read(
    "src/components/products/practice-page/PublishPreviewBanner.tsx",
  );
  const publishRoute = read(
    "src/app/api/author/products/[id]/publish/route.ts",
  );
  const paths = read("src/lib/products/paths.ts");

  assert.match(
    paths,
    /export function buildPracticePublishPreviewPath/,
    "paths helper exists",
  );
  assert.match(page, /canActivatePublishPreviewMode/);
  assert.match(page, /shouldTrackPracticeListenerAnalytics/);
  assert.match(page, /shouldIndexPracticePage/);
  assert.match(page, /robots: indexable/);
  assert.match(
    page,
    /trackListenerAnalytics \? \(\s*<PracticeViewTracker/,
    "PracticeViewTracker gated by analytics helper",
  );
  assert.match(
    page,
    /trackListenerAnalytics && user \? \(\s*<PromoPostSignupHandler/,
    "promo signup analytics gated",
  );
  assert.doesNotMatch(
    page,
    /<PracticeViewTracker[\s\S]*publishPreviewMode/,
    "tracker is not rendered unconditionally beside preview mode",
  );

  assert.match(form, /openPublishPreviewTab/);
  assert.match(form, /shouldOpenPublishPreviewFromForm/);
  assert.match(form, /window\.open\("about:blank", "_blank"\)/);
  assert.match(form, /previewTab\?\.close\(\)/);
  assert.match(form, /Предпросмотр/);
  assert.match(
    form,
    /shouldOpenPublishPreviewFromForm\(\{\s*publishedAt: form\.publishedAt,\s*canBypassProductModeration,/,
    "form publish gate is bypass-aware",
  );
  assert.match(
    form,
    /window\.location\.replace\(\s*buildPracticePublicPath\(authorSlug, productSlug\)/,
    "direct form publish redirects to publicPath on success",
  );

  assert.match(banner, /publishInFlightRef/);
  assert.match(banner, /isPublishNotReadyResponse/);
  // Successful publish replaces the preview URL with the public product path.
  assert.match(banner, /window\.location\.replace\(publicPath\)/);
  assert.doesNotMatch(banner, /published=1/);
  assert.doesNotMatch(banner, /location\.assign\(/);
  // Redirect runs only after a successful publish response.
  const publishHandler = banner.slice(
    banner.indexOf("async function handlePublish"),
    banner.indexOf("return ("),
  );
  assert.match(publishHandler, /if \(!response\.ok\)/);
  assert.match(
    publishHandler,
    /window\.location\.replace\(publicPath\)/,
    "redirect uses publicPath after success",
  );
  const errorReturnIdx = publishHandler.indexOf(
    "Не удалось опубликовать аудиопродукт.",
  );
  const replaceIdx = publishHandler.indexOf(
    "window.location.replace(publicPath)",
  );
  assert.ok(errorReturnIdx >= 0 && replaceIdx > errorReturnIdx);
  assert.match(banner, /Вернуться к редактированию/);
  assert.match(banner, /Посмотреть глазами слушателя/);
  assert.match(banner, /Опубликовать/);
  assert.match(banner, /listenerViewHref/);
  assert.match(banner, /sm:grid-cols-\[repeat\(3,auto\)\]/);

  assert.match(page, /canActivatePublishListenerViewMode/);
  assert.match(page, /publishListenerViewMode/);
  assert.match(page, /buildPracticePublishListenerPreviewPath/);
  assert.match(page, /Вернуться в предпросмотр автора/);
  assert.match(
    paths,
    /export function buildPracticePublishListenerPreviewPath/,
    "listener-view path helper exists",
  );

  assert.match(publishRoute, /publishReady:\s*false/);

  assert.match(
    read("src/lib/author-products/auth.ts"),
    /role !== "owner" && membership\.role !== "editor"/,
    "publish still uses existing owner|editor membership RBAC",
  );
}

function testIncompleteDraftPreviewAllowedInUi() {
  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  const openFn = form.slice(
    form.indexOf("async function openPublishPreviewTab"),
    form.indexOf("async function publishProduct"),
  );

  assert.equal(
    openFn.includes("evaluatePublishReadiness"),
    false,
    "preview open does not require publish readiness",
  );
  assert.equal(
    openFn.includes("validatePublishRequirements"),
    false,
    "preview open does not run publish validation",
  );
  assert.match(openFn, /saveProduct/);
  assert.match(openFn, /previewTab\?\.close/);
}

testPathsHelper();
testFirstPublishGate();
testActivationRbac();
testSeoAndAnalyticsGuards();
testListenerIdenticalPresentation();
testDraftListenerViewPresentation();
testStructuredNotReady();
testSourceContracts();
testIncompleteDraftPreviewAllowedInUi();

console.log("product-publish-preview-unit: ok");
