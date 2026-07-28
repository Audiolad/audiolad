#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluatePublishReadiness,
} from "../src/lib/author-products/publish.ts";
import {
  evaluateAuthorOnboardingChecklist,
} from "../src/lib/author-dashboard/onboarding-checklist.ts";
import {
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
} from "../src/lib/author-dashboard/commercial-onboarding.ts";
import {
  buildAuthorOpportunitiesView,
  resolveAuthorOpportunitiesPrimaryCta,
  resolveAuthorOpportunitiesRewardCta,
  withAuthorQuery,
} from "../src/lib/author-dashboard/opportunities.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function basePractice(overrides = {}) {
  return {
    id: "practice-1",
    author_id: "author-1",
    title: "Практика",
    slug: "praktika",
    subtitle: null,
    description: "Описание практики для слушателей.",
    format: "Медитация",
    duration_minutes: 10,
    price: 0,
    is_free: true,
    cover_url: "https://cdn.example/cover.jpg",
    use_shared_cover: true,
    audio_url: null,
    status: "draft",
    currency: "RUB",
    published_at: null,
    listening_notice_enabled: false,
    listening_notice_title: "",
    listening_notice_text: "",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function baseAudio(overrides = {}) {
  return {
    id: "audio-1",
    practice_id: "practice-1",
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
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function readyReadiness(accessStatus = "free") {
  return evaluatePublishReadiness(basePractice(), [baseAudio()], {
    accessStatus,
    activeTopicCount: 1,
  });
}

function emptyReadiness() {
  return evaluatePublishReadiness(
    basePractice({
      description: "",
      cover_url: null,
    }),
    [],
    { accessStatus: "free", activeTopicCount: 0 },
  );
}

function completeProfile() {
  return {
    short_positioning: "Психолог",
    full_bio: "Полное описание автора для публичной страницы.",
    avatar_url: "https://cdn.example/avatar.jpg",
    avatar_path: "avatars/a.jpg",
    avatar_image: { source: "upload" },
  };
}

function emptyProfile() {
  return {
    short_positioning: "",
    full_bio: "",
    avatar_url: null,
    avatar_path: null,
    avatar_image: null,
  };
}

function wrapChecklist(free, accessStatus = "free", commercialOverrides = {}) {
  const commercial = evaluateCommercialOnboardingChecklist({
    authorSlug: free.authorSlug,
    accessStatus,
    freeGateReady: free.readyForCommercial,
    products: [],
    campaigns: [],
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      termsAcceptanceAvailable: true,
    },
    applicationStatus: null,
    applicationReviewComment: null,
    payoutProfileStatus: null,
    payoutProfileReviewComment: null,
    payoutProfileHasStoredRequisites: false,
    applicationHref: `/author-dashboard/commercial-application?author=${free.authorSlug}`,
    payoutDetailsHref: `/author-dashboard/commercial/payout-details?author=${free.authorSlug}`,
    termsHref: `/author-dashboard/commercial/terms?author=${free.authorSlug}`,
    payoutDetailsComplete: false,
    termsAccepted: false,
    ...commercialOverrides,
  });

  return {
    ...free,
    commercial,
    journeyComplete: free.complete && commercial.complete,
  };
}

function buildChecklist({
  profile = completeProfile(),
  products = [],
  campaigns = [],
  accessStatus = "free",
  commercialOverrides = {},
} = {}) {
  const free = evaluateAuthorOnboardingChecklist({
    authorId: "author-1",
    authorSlug: "demo-author",
    profile,
    products,
    campaigns,
  });

  return wrapChecklist(free, accessStatus, commercialOverrides);
}

function primary(input) {
  return resolveAuthorOpportunitiesPrimaryCta({
    authorSlug: "demo-author",
    accessStatus: "free",
    hasPromoPage: false,
    ...input,
  });
}

// ---------------------------------------------------------------------------
// File wiring
// ---------------------------------------------------------------------------
{
  const page = read("src/app/author-dashboard/opportunities/page.tsx");
  assert.match(page, /loadAuthorOpportunitiesView/);
  assert.match(page, /listAuthorWorkspacesForUser/);
  assert.match(page, /requireAuthorMembership/);
  assert.match(page, /author-dashboard\/opportunities\?author=/);
  assert.doesNotMatch(page, /AuthorDashboardNav/);

  const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
  assert.doesNotMatch(nav, /opportunities/);

  const home = read("src/components/author-dashboard/AuthorDashboardClient.tsx");
  assert.match(home, /Возможности для авторов/);
  assert.match(home, /Посмотреть возможности/);
  assert.match(home, /\/author-dashboard\/opportunities\?author=/);
  assert.match(home, /AuthorOnboardingChecklist/);

  const promotion = read(
    "src/components/author-dashboard/AuthorPromotionClient.tsx",
  );
  assert.match(promotion, /готовые сценарии продвижения/);
  assert.match(promotion, /\/author-dashboard\/opportunities\?author=/);

  const loader = read("src/lib/author-dashboard/load-author-opportunities.ts");
  assert.match(loader, /loadAuthorOnboardingChecklistState/);
  assert.match(loader, /promo_pages/);
  assert.match(loader, /personal_materials/);
  assert.match(loader, /\.limit\(1\)/);
  assert.doesNotMatch(loader, /getAuthorStatsSummary|getAuthorFinanceLedger/);
}

// ---------------------------------------------------------------------------
// withAuthorQuery / multi-workspace hrefs
// ---------------------------------------------------------------------------
{
  assert.equal(
    withAuthorQuery("/author-dashboard/opportunities", "alpha"),
    "/author-dashboard/opportunities?author=alpha",
  );
  assert.equal(
    withAuthorQuery("/author-dashboard/stats?period=30d", "beta"),
    "/author-dashboard/stats?period=30d&author=beta",
  );
  assert.equal(
    withAuthorQuery("/author-dashboard/opportunities", "автор с пробелом"),
    `/author-dashboard/opportunities?author=${encodeURIComponent("автор с пробелом")}`,
  );
}

// 1. empty profile
{
  const checklist = buildChecklist({ profile: emptyProfile() });
  const cta = primary({ checklist });
  assert.equal(cta.id, "profile");
  assert.equal(cta.label, "Оформить страницу автора");
  assert.match(cta.href, /\/author-dashboard\/profile\?author=demo-author/);
  assert.doesNotMatch(cta.href ?? "", /\/finance/);
}

// 2. no products
{
  const checklist = buildChecklist();
  const cta = primary({ checklist });
  assert.equal(cta.id, "create_product");
  assert.equal(cta.label, "Создать первый продукт");
  assert.match(cta.href, /\/products\/new\?author=demo-author/);
}

// 3. draft needing work
{
  const checklist = buildChecklist({
    products: [
      {
        id: "p1",
        title: "Черновик",
        slug: "chernovik",
        status: "draft",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: emptyReadiness(),
      },
    ],
  });
  const cta = primary({ checklist });
  assert.equal(cta.id, "continue_draft");
  assert.equal(cta.label, "Продолжить оформление");
  assert.equal(cta.href, "/author-dashboard/products/p1");
}

// 4. ready but unpublished
{
  const checklist = buildChecklist({
    products: [
      {
        id: "p1",
        title: "Готовый",
        slug: "gotovyi",
        status: "draft",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness(),
      },
    ],
  });
  const cta = primary({ checklist });
  assert.equal(cta.id, "publish_product");
  assert.equal(cta.label, "Опубликовать продукт");
  assert.equal(cta.href, "/author-dashboard/products/p1");
}

// unpublished status also continues toward publish when ready
{
  const checklist = buildChecklist({
    products: [
      {
        id: "p1",
        title: "Снятый",
        slug: "snyatyi",
        status: "unpublished",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness(),
      },
    ],
  });
  const cta = primary({ checklist });
  assert.equal(cta.id, "publish_product");
}

// 5. published, no campaign
{
  const checklist = buildChecklist({
    products: [
      {
        id: "p1",
        title: "Опубликованный",
        slug: "published",
        status: "published",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness(),
      },
    ],
  });
  const cta = primary({ checklist });
  assert.equal(cta.id, "start_promotion");
  assert.equal(cta.label, "Начать продвижение");
  assert.match(cta.href, /\/author-dashboard\/promotion\?author=demo-author/);
}

// 6. campaign exists, no promo page
{
  const checklist = buildChecklist({
    products: [
      {
        id: "p1",
        title: "Опубликованный",
        slug: "published",
        status: "published",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness(),
      },
    ],
    campaigns: [
      {
        id: "c1",
        status: "active",
        practice_id: "p1",
        practice_status: "published",
      },
    ],
  });
  assert.equal(checklist.complete, true);
  const cta = primary({ checklist, hasPromoPage: false });
  assert.equal(cta.id, "create_promo_page");
  assert.equal(cta.label, "Создать промостраницу");
  assert.match(cta.href, /\/author-dashboard\/promotion\?author=demo-author/);
}

// 7. starter path complete + promo page → stats
{
  const checklist = buildChecklist({
    products: [
      {
        id: "p1",
        title: "Опубликованный",
        slug: "published",
        status: "published",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness(),
      },
    ],
    campaigns: [
      {
        id: "c1",
        status: "active",
        practice_id: "p1",
        practice_status: "published",
      },
    ],
  });
  const cta = primary({ checklist, hasPromoPage: true });
  assert.equal(cta.id, "open_stats");
  assert.equal(cta.label, "Посмотреть статистику");
  assert.match(cta.href, /\/author-dashboard\/stats\?author=demo-author/);
}

// 8. commercial unavailable → reward CTA goes to status, not finance
{
  const checklist = buildChecklist({
    products: [
      {
        id: "p1",
        title: "Опубликованный",
        slug: "published",
        status: "published",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness(),
      },
    ],
    campaigns: [
      {
        id: "c1",
        status: "active",
        practice_id: "p1",
        practice_status: "published",
      },
    ],
  });
  const reward = resolveAuthorOpportunitiesRewardCta({
    authorSlug: "demo-author",
    accessStatus: "free",
    checklist,
  });
  assert.equal(reward.label, "Узнать о коммерческом статусе");
  assert.match(reward.href ?? "", /\/author-dashboard\/status\?author=demo-author/);
  assert.doesNotMatch(reward.href ?? "", /\/finance/);

  const view = buildAuthorOpportunitiesView({
    authorId: "author-1",
    authorSlug: "demo-author",
    accessStatus: "free",
    checklist,
    hasPromoPage: true,
    hasPersonalMaterial: false,
  });
  const rewardStep = view.journey.find((step) => step.id === "reward");
  assert.equal(rewardStep?.cta.label, "Узнать о коммерческом статусе");
  assert.doesNotMatch(rewardStep?.cta.href ?? "", /\/finance/);
  // free author without requisites still gets growth CTA, not payout
  assert.equal(view.primaryCta.id, "open_stats");
}

// 9. commercial available
{
  const checklist = buildChecklist({
    accessStatus: "commercial_active",
    products: [
      {
        id: "p1",
        title: "Опубликованный",
        slug: "published",
        status: "published",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness("commercial_active"),
      },
    ],
    campaigns: [
      {
        id: "c1",
        status: "active",
        practice_id: "p1",
        practice_status: "published",
      },
    ],
    commercialOverrides: {
      applicationStatus: "approved",
      termsAccepted: true,
      payoutDetailsComplete: false,
    },
  });

  const reward = resolveAuthorOpportunitiesRewardCta({
    authorSlug: "demo-author",
    accessStatus: "commercial_active",
    checklist,
  });
  assert.equal(reward.label, "Открыть финансы");
  assert.match(reward.href ?? "", /\/author-dashboard\/finance\?author=demo-author/);

  const cta = primary({
    checklist,
    accessStatus: "commercial_active",
    hasPromoPage: true,
  });
  assert.ok(
    cta.id === "open_stats" || cta.id === "create_paid_product",
    `unexpected commercial primary id: ${cta.id}`,
  );
  assert.doesNotMatch(cta.href ?? "", /payout-details/);
}

// commercial_onboarding after starter complete → status/terms CTA, not finance
{
  const checklist = buildChecklist({
    accessStatus: "commercial_onboarding",
    products: [
      {
        id: "p1",
        title: "Опубликованный",
        slug: "published",
        status: "published",
        is_free: true,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: readyReadiness(),
      },
    ],
    campaigns: [
      {
        id: "c1",
        status: "active",
        practice_id: "p1",
        practice_status: "published",
      },
    ],
    commercialOverrides: {
      applicationStatus: "approved",
      termsAccepted: false,
    },
  });
  const cta = primary({
    checklist,
    accessStatus: "commercial_onboarding",
    hasPromoPage: true,
  });
  assert.equal(cta.id, "commercial_status");
  assert.doesNotMatch(cta.href ?? "", /\/finance/);
}

// paid-only account still nudged to free product
{
  const checklist = buildChecklist({
    products: [
      {
        id: "paid-1",
        title: "Платный",
        slug: "platnyi",
        status: "draft",
        is_free: false,
        updated_at: "2026-07-02T10:00:00.000Z",
        readiness: emptyReadiness(),
      },
    ],
  });
  assert.equal(checklist.hasNonArchivedPaidOnlyProducts, true);
  const cta = primary({ checklist });
  assert.equal(cta.id, "create_product");
  assert.match(cta.label, /бесплатн|первый/i);
  assert.match(cta.summary, /бесплатн/i);
}

// wrong/missing author slug handling is page-level fallback; hrefs always carry selected slug
{
  const viewA = buildAuthorOpportunitiesView({
    authorId: "a1",
    authorSlug: "alpha",
    accessStatus: "free",
    checklist: buildChecklist(),
    hasPromoPage: false,
    hasPersonalMaterial: false,
  });
  const viewB = buildAuthorOpportunitiesView({
    authorId: "a2",
    authorSlug: "beta",
    accessStatus: "free",
    checklist: (() => {
      const free = evaluateAuthorOnboardingChecklist({
        authorId: "a2",
        authorSlug: "beta",
        profile: completeProfile(),
        products: [],
        campaigns: [],
      });
      return wrapChecklist(free);
    })(),
    hasPromoPage: false,
    hasPersonalMaterial: false,
  });
  assert.match(viewA.primaryCta.href ?? "", /author=alpha/);
  assert.match(viewB.primaryCta.href ?? "", /author=beta/);
  assert.match(viewA.scenarios[0].cta.href ?? "", /author=alpha/);
  assert.match(viewB.scenarios[0].cta.href ?? "", /author=beta/);
}

// progress is compact states, not percentages
{
  const view = buildAuthorOpportunitiesView({
    authorId: "author-1",
    authorSlug: "demo-author",
    accessStatus: "free",
    checklist: buildChecklist(),
    hasPromoPage: false,
    hasPersonalMaterial: false,
  });
  assert.ok(view.progress.length >= 4);
  for (const item of view.progress) {
    assert.ok(["done", "next", "later"].includes(item.state));
  }
  const ui = read(
    "src/components/author-dashboard/AuthorOpportunitiesClient.tsx",
  );
  assert.doesNotMatch(ui, /%\d|\d%/);
  assert.match(ui, /без шкалы готовности/);
}

console.log("author-opportunities-hub-unit: ok");
