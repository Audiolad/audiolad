#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { AUTHOR_DEFAULT_AVATAR_PATH } from "../src/lib/authors/brand-assets.ts";
import { hasUserAuthorAvatar } from "../src/lib/authors/has-user-avatar.ts";
import {
  evaluatePublishReadiness,
  validatePublishRequirements,
} from "../src/lib/author-products/publish.ts";
import {
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
  resolveCommercialApplicationStatus,
} from "../src/lib/author-dashboard/commercial-onboarding.ts";
import {
  buildAuthorOnboardingStorageKey,
  evaluateAuthorOnboardingChecklist,
  focusProductSuitabilityScore,
  isAuthorProfileMinimumComplete,
  isFreeOnboardingReadyForCommercial,
  parseAuthorOnboardingUiPreference,
  selectFocusProduct,
  serializeAuthorOnboardingUiPreference,
} from "../src/lib/author-dashboard/onboarding-checklist.ts";

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

function readyReadiness(activeTopicCount = 1, accessStatus = "free") {
  return evaluatePublishReadiness(basePractice(), [baseAudio()], {
    accessStatus,
    activeTopicCount,
  });
}

function readyPaidReadiness(activeTopicCount = 1) {
  return evaluatePublishReadiness(
    basePractice({
      is_free: false,
      price: 990,
    }),
    [baseAudio()],
    {
      accessStatus: "commercial",
      activeTopicCount,
    },
  );
}

function completeProfile() {
  return {
    short_positioning: "Позиционирование",
    full_bio: "О себе",
    avatar_url: "https://cdn.example/avatar.jpg",
  };
}

function evaluateCommercial(overrides = {}) {
  return evaluateCommercialOnboardingChecklist({
    authorSlug: "demo-author",
    accessStatus: "free",
    freeGateReady: true,
    products: [],
    campaigns: [],
    capabilities: DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
    ...overrides,
  });
}

function partialReadiness() {
  return evaluatePublishReadiness(
    basePractice({
      // description present so visible progress > 0; cover/audio/topics still missing
      cover_url: null,
    }),
    [],
    {
      accessStatus: "free",
      activeTopicCount: 0,
    },
  );
}

function emptyDraftReadiness() {
  return evaluatePublishReadiness(
    basePractice({
      title: "Новый черновик",
      slug: "novyi-chernovik",
      description: "",
      format: null,
      cover_url: null,
    }),
    [],
    {
      accessStatus: "free",
      activeTopicCount: 0,
    },
  );
}

function product(overrides = {}, readiness = emptyDraftReadiness()) {
  return {
    id: "practice-1",
    title: "Практика",
    slug: "praktika",
    status: "draft",
    is_free: true,
    updated_at: "2026-07-01T10:00:00.000Z",
    readiness,
    ...overrides,
  };
}

function testHasUserAuthorAvatar() {
  assert.equal(hasUserAuthorAvatar({}), false);
  assert.equal(
    hasUserAuthorAvatar({ avatar_url: AUTHOR_DEFAULT_AVATAR_PATH }),
    false,
  );
  assert.equal(
    hasUserAuthorAvatar({
      avatar_url: "https://cdn.example/brand/author-default-avatar.png",
    }),
    false,
  );
  assert.equal(
    hasUserAuthorAvatar({
      avatar_url: "https://cdn.example/authors/a/avatar.jpg",
    }),
    true,
  );
  assert.equal(
    hasUserAuthorAvatar({
      avatar_path: "authors/a/avatar.webp",
    }),
    true,
  );
  assert.equal(
    hasUserAuthorAvatar({
      avatar_image: {
        version: 1,
        versionId: "v1",
        profile: "avatar",
        sourceWidth: 400,
        sourceHeight: 400,
        variants: {
          md: {
            path: "authors/a/avatar-md.webp",
            width: 256,
            height: 256,
            byteSize: 1000,
            mimeType: "image/webp",
          },
        },
      },
    }),
    true,
  );
}

function testProfileMinimum() {
  assert.equal(isAuthorProfileMinimumComplete({}), false);
  assert.equal(
    isAuthorProfileMinimumComplete({
      short_positioning: "Помогаю со сном",
      full_bio: "Подробно о себе",
      avatar_url: AUTHOR_DEFAULT_AVATAR_PATH,
    }),
    false,
  );
  assert.equal(
    isAuthorProfileMinimumComplete({
      short_positioning: "Помогаю со сном",
      full_bio: "Подробно о себе",
      avatar_url: "https://cdn.example/avatar.jpg",
    }),
    true,
  );
  assert.equal(
    isAuthorProfileMinimumComplete({
      short_positioning: "   ",
      full_bio: "Подробно о себе",
      avatar_url: "https://cdn.example/avatar.jpg",
    }),
    false,
  );
}

function testPublishReadinessShared() {
  const empty = evaluatePublishReadiness(
    basePractice({
      description: "",
      cover_url: null,
      format: null,
    }),
    [],
    { accessStatus: "free", activeTopicCount: 0 },
  );

  assert.equal(empty.ok, false);
  assert.equal(empty.requirements.some((item) => item.key === "topics"), true);
  assert.equal(
    empty.requirements.find((item) => item.key === "description")?.ok,
    false,
  );
  assert.equal(
    empty.requirements.find((item) => item.key === "cover")?.ok,
    false,
  );
  assert.equal(
    empty.requirements.find((item) => item.key === "audio")?.ok,
    false,
  );
  assert.equal(
    empty.requirements.find((item) => item.key === "topics")?.ok,
    false,
  );

  const ready = readyReadiness(1);
  assert.equal(ready.ok, true);
  assert.equal(ready.completedCount, ready.totalCount);

  const legacy = validatePublishRequirements(
    basePractice({ description: "" }),
    [baseAudio()],
    "free",
  );
  assert.equal(legacy.ok, false);
  assert.equal(legacy.code, "missing_description");

  const withTopics = validatePublishRequirements(
    basePractice(),
    [baseAudio()],
    "free",
    0,
  );
  assert.equal(withTopics.ok, false);
  assert.equal(withTopics.code, "topic_min_required");
}

function testFocusProductSelection() {
  const emptyDraft = product(
    {
      id: "empty",
      title: "Пустой",
      updated_at: "2026-07-20T10:00:00.000Z",
    },
    emptyDraftReadiness(),
  );
  const almostReady = product(
    {
      id: "almost",
      title: "Почти готов",
      updated_at: "2026-07-01T10:00:00.000Z",
    },
    partialReadiness(),
  );
  const publishReady = product(
    {
      id: "ready",
      title: "Готов",
      updated_at: "2026-06-01T10:00:00.000Z",
    },
    readyReadiness(),
  );

  const focus = selectFocusProduct([emptyDraft, almostReady, publishReady]);
  assert.equal(focus?.id, "ready");

  const focusWithoutReady = selectFocusProduct([emptyDraft, almostReady]);
  assert.equal(focusWithoutReady?.id, "almost");

  assert.ok(
    focusProductSuitabilityScore(publishReady) >
      focusProductSuitabilityScore(emptyDraft),
  );
}

function evaluate(overrides = {}) {
  return evaluateAuthorOnboardingChecklist({
    authorId: "author-1",
    authorSlug: "demo-author",
    profile: {},
    products: [],
    campaigns: [],
    ...overrides,
  });
}

function testEmptyAuthor() {
  const state = evaluate();
  assert.equal(state.completedCount, 0);
  assert.equal(state.complete, false);
  assert.equal(state.readyForCommercial, false);
  assert.equal(state.steps[0].completed, false);
  assert.equal(state.steps[0].active, true);
  assert.equal(state.steps[0].ctaLabel, "Оформить страницу");
}

function testPartialAndFullProfile() {
  const partial = evaluate({
    profile: {
      short_positioning: "Позиционирование",
      full_bio: "",
      avatar_url: "https://cdn.example/avatar.jpg",
    },
  });
  assert.equal(partial.steps[0].completed, false);
  assert.equal(partial.steps[0].ctaLabel, "Продолжить оформление");

  const full = evaluate({
    profile: {
      short_positioning: "Позиционирование",
      full_bio: "О себе",
      avatar_url: "https://cdn.example/avatar.jpg",
    },
  });
  assert.equal(full.steps[0].completed, true);
  assert.equal(full.steps[1].active, true);
}

function testFreeProductGate() {
  const paidOnly = evaluate({
    profile: {
      short_positioning: "Позиционирование",
      full_bio: "О себе",
      avatar_url: "https://cdn.example/avatar.jpg",
    },
    products: [
      product(
        {
          id: "paid",
          is_free: false,
          status: "draft",
        },
        emptyDraftReadiness(),
      ),
    ],
  });
  assert.equal(paidOnly.steps[1].completed, false);
  assert.equal(paidOnly.hasNonArchivedPaidOnlyProducts, true);
  assert.match(paidOnly.steps[1].hint ?? "", /бесплатный продукт/i);

  const freeDraft = evaluate({
    profile: {
      short_positioning: "Позиционирование",
      full_bio: "О себе",
      avatar_url: "https://cdn.example/avatar.jpg",
    },
    products: [product({}, emptyDraftReadiness())],
  });
  assert.equal(freeDraft.steps[1].completed, true);
  assert.equal(freeDraft.steps[2].completed, false);
  assert.equal(freeDraft.steps[2].active, true);
}

function testPreparePublishPromotionAndComplete() {
  const profile = {
    short_positioning: "Позиционирование",
    full_bio: "О себе",
    avatar_url: "https://cdn.example/avatar.jpg",
  };

  const partialDraft = evaluate({
    profile,
    products: [product({}, partialReadiness())],
  });
  assert.equal(partialDraft.steps[2].completed, false);
  assert.ok((partialDraft.steps[2].readiness?.completedCount ?? 0) > 0);
  assert.ok(
    (partialDraft.steps[2].readiness?.completedCount ?? 0) <
      (partialDraft.steps[2].readiness?.totalCount ?? 1),
  );

  const publishReadyDraft = evaluate({
    profile,
    products: [product({ status: "draft" }, readyReadiness())],
  });
  assert.equal(publishReadyDraft.steps[2].completed, true);
  assert.equal(publishReadyDraft.steps[3].completed, false);
  assert.equal(publishReadyDraft.steps[3].active, true);

  const published = evaluate({
    profile,
    products: [
      product(
        {
          status: "published",
          updated_at: "2026-07-10T10:00:00.000Z",
        },
        readyReadiness(),
      ),
    ],
  });
  assert.equal(published.steps[3].completed, true);
  assert.equal(published.steps[3].ctaLabel, "Открыть страницу продукта");
  assert.equal(published.steps[4].completed, false);

  const unpublished = evaluate({
    profile,
    products: [
      product(
        {
          status: "unpublished",
        },
        readyReadiness(),
      ),
    ],
  });
  assert.equal(unpublished.steps[3].completed, false);

  const archived = evaluate({
    profile,
    products: [
      product(
        {
          status: "archived",
          is_free: true,
        },
        readyReadiness(),
      ),
    ],
  });
  assert.equal(archived.steps[1].completed, false);
  assert.equal(archived.steps[3].completed, false);

  const withActivePromo = evaluate({
    profile,
    products: [
      product(
        {
          id: "practice-1",
          status: "published",
        },
        readyReadiness(),
      ),
    ],
    campaigns: [
      {
        id: "campaign-1",
        status: "active",
        practice_id: "practice-1",
        practice_status: "published",
      },
    ],
  });
  assert.equal(withActivePromo.complete, true);
  assert.equal(withActivePromo.completedCount, 5);

  const inactivePromo = evaluate({
    profile,
    products: [
      product(
        {
          id: "practice-1",
          status: "published",
        },
        readyReadiness(),
      ),
    ],
    campaigns: [
      {
        id: "campaign-archived",
        status: "archived",
        practice_id: "practice-1",
        practice_status: "published",
      },
      {
        id: "campaign-stale",
        status: "active",
        practice_id: "practice-1",
        practice_status: "unpublished",
      },
    ],
  });
  assert.equal(inactivePromo.steps[4].completed, false);
}

function testUiPreferenceStorage() {
  assert.equal(
    buildAuthorOnboardingStorageKey("author-1"),
    "audiolad:author-onboarding:v1:author-1",
  );

  const parsed = parseAuthorOnboardingUiPreference(
    serializeAuthorOnboardingUiPreference({
      collapsed: true,
      dismissed: true,
    }),
  );
  assert.deepEqual(parsed, { collapsed: true, dismissed: true });
  assert.deepEqual(parseAuthorOnboardingUiPreference("not-json"), {
    collapsed: false,
    dismissed: false,
  });
}

function testSourceGuards() {
  const dashboard = read(
    "src/components/author-dashboard/AuthorDashboardClient.tsx",
  );
  assert.match(dashboard, /AuthorOnboardingChecklist/);
  assert.match(dashboard, /AuthorAccessStatusBanner/);
  assert.match(dashboard, /Создайте свою первую практику/);
  assert.match(dashboard, /Создать бесплатный продукт/);

  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  const initialFormMatch = form.match(
    /function buildInitialForm[\s\S]*?return \{[\s\S]*?isFree:\s*true[\s\S]*?\};/,
  );
  assert.ok(initialFormMatch, "buildInitialForm defaults isFree: true");

  const publishRoute = read(
    "src/app/api/author/products/[id]/publish/route.ts",
  );
  assert.match(publishRoute, /evaluatePublishReadiness/);
  assert.match(publishRoute, /countActivePracticeTopics/);
  assert.doesNotMatch(publishRoute, /validatePublishRequirements\(/);

  const onboardingApi = read("src/app/api/author/onboarding/route.ts");
  assert.match(onboardingApi, /requireAuthorMembership/);
  assert.match(onboardingApi, /loadAuthorOnboardingChecklistState/);

  const checklistUi = read(
    "src/components/author-dashboard/AuthorOnboardingChecklist.tsx",
  );
  assert.match(checklistUi, /Начните работу на АудиоЛаде/);
  assert.match(checklistUi, /Бесплатный старт/);
  assert.match(checklistUi, /Начните зарабатывать на своих аудиопродуктах/);
  assert.match(checklistUi, /Пока недоступно/);
  assert.match(checklistUi, /Скоро будет доступно/);
  assert.match(checklistUi, /Поздравляем/);
  assert.match(checklistUi, /Ваша страница автора полностью готова/);
  assert.match(checklistUi, /Показать стартовый чек-лист/);
  assert.match(checklistUi, /useAuthorOnboardingUiPreference/);
  assert.match(checklistUi, /journeyComplete/);
  assert.match(
    read("src/lib/author-dashboard/onboarding-preference-store.ts"),
    /buildAuthorOnboardingStorageKey/,
  );
  assert.match(
    read("src/lib/author-dashboard/onboarding-checklist.ts"),
    /audiolad:author-onboarding:v1:/,
  );
  assert.match(
    read("src/lib/author-dashboard/commercial-onboarding.ts"),
    /evaluateCommercialOnboardingChecklist/,
  );
  assert.match(
    read("src/lib/author-dashboard/load-onboarding-state.ts"),
    /evaluateCommercialOnboardingChecklist/,
  );
}

function testCommercialScenarios() {
  // 1. New author without profile
  const emptyFree = evaluate();
  assert.equal(emptyFree.readyForCommercial, false);
  const gated = evaluateCommercial({ freeGateReady: false });
  assert.equal(gated.unlocked, false);
  assert.equal(gated.progressMode, "gated");
  assert.equal(gated.steps[0].state, "locked");
  assert.equal(gated.steps[0].statusLabel, "Пока недоступно");

  // 2. Profile complete, no product
  const profileOnly = evaluate({ profile: completeProfile() });
  assert.equal(profileOnly.steps[0].completed, true);
  assert.equal(profileOnly.readyForCommercial, false);

  // 3. Free product created, not ready
  const draftFree = evaluate({
    profile: completeProfile(),
    products: [product({}, emptyDraftReadiness())],
  });
  assert.equal(draftFree.steps[1].completed, true);
  assert.equal(draftFree.steps[2].completed, false);
  assert.equal(draftFree.readyForCommercial, false);

  // 4. Free product ready, not published
  const readyFree = evaluate({
    profile: completeProfile(),
    products: [product({}, readyReadiness())],
  });
  assert.equal(readyFree.steps[2].completed, true);
  assert.equal(readyFree.steps[3].completed, false);
  assert.equal(readyFree.readyForCommercial, false);

  // 5. Free published, no promo — commercial gate opens; promo step still open
  const publishedFree = evaluate({
    profile: completeProfile(),
    products: [
      product(
        {
          status: "published",
        },
        readyReadiness(),
      ),
    ],
  });
  assert.equal(publishedFree.readyForCommercial, true);
  assert.equal(publishedFree.steps[4].completed, false);
  assert.equal(
    isFreeOnboardingReadyForCommercial([
      true,
      true,
      true,
      true,
      false,
    ]),
    true,
  );

  // 6. Commercial application form available by default → Подать заявку
  const noApplication = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "free",
  });
  assert.equal(noApplication.unlocked, true);
  assert.equal(noApplication.progressMode, "count");
  assert.equal(noApplication.steps[0].id, "commercial_application");
  assert.equal(noApplication.steps[0].state, "active");
  assert.equal(noApplication.steps[0].actionLabel, "Подать заявку");
  assert.equal(
    noApplication.steps[0].href,
    "/author-dashboard/commercial-application?author=demo-author",
  );
  assert.equal(noApplication.steps[1].state, "locked");
  assert.equal(noApplication.steps[3].state, "locked");

  // Capability off still shows coming_soon
  const formUnavailable = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "free",
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      applicationSubmissionAvailable: false,
    },
  });
  assert.equal(formUnavailable.steps[0].state, "coming_soon");
  assert.equal(formUnavailable.steps[0].statusLabel, "Скоро будет доступно");

  // 7. Commercial application submitted / in review
  assert.equal(
    resolveCommercialApplicationStatus({
      accessStatus: "commercial_pending",
    }),
    "in_review",
  );
  const submitted = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial_pending",
  });
  assert.equal(submitted.steps[0].state, "active");
  assert.equal(submitted.steps[0].statusLabel, "На рассмотрении");
  assert.equal(submitted.steps[0].actionLabel, "Смотреть заявку");
  assert.equal(submitted.steps[1].state, "locked");
  assert.equal(submitted.steps[3].state, "locked");

  const submittedExplicit = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial_pending",
    applicationStatus: "submitted",
  });
  assert.equal(submittedExplicit.steps[0].statusLabel, "Заявка отправлена");
  assert.equal(submittedExplicit.steps[0].actionLabel, "Смотреть заявку");
  assert.match(
    submittedExplicit.steps[0].description,
    /получили заявку/i,
  );
  assert.equal(
    submittedExplicit.steps[0].hint,
    null,
    "submitted must not duplicate description in yellow hint",
  );

  const draftContinue = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "free",
    applicationStatus: "draft",
  });
  assert.equal(draftContinue.steps[0].actionLabel, "Продолжить заполнение");
  assert.match(
    draftContinue.steps[0].href ?? "",
    /commercial-application\?author=demo-author/,
  );

  const needsChanges = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial_pending",
    applicationStatus: "needs_changes",
    applicationReviewComment: "Уточните формат материалов.",
  });
  assert.equal(needsChanges.steps[0].statusLabel, "Нужно уточнить данные");
  assert.equal(needsChanges.steps[0].actionLabel, "Исправить заявку");
  assert.equal(needsChanges.steps[0].hint, "Уточните формат материалов.");

  const legacyPending = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial_pending",
    legacyPendingWithoutApplication: true,
  });
  assert.equal(legacyPending.steps[0].statusLabel, "На рассмотрении");
  assert.equal(legacyPending.steps[0].actionLabel, undefined);
  assert.equal(legacyPending.steps[0].href, undefined);

  const rejected = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "free",
    applicationStatus: "rejected",
  });
  assert.equal(rejected.steps[0].statusLabel, "Заявка не одобрена");

  // 8–9. After approve (commercial_onboarding) payout/terms open; paid locked
  const approved = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial_onboarding",
    applicationStatus: "approved",
    capabilities: {
      applicationSubmissionAvailable: true,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsHref: "/author-dashboard/commercial/payout-details",
    termsHref: "/author-dashboard/commercial/terms",
  });
  assert.equal(approved.steps[0].state, "completed");
  assert.equal(approved.steps[0].statusLabel, "Одобрена");
  assert.equal(approved.steps[1].state, "active");
  assert.equal(approved.steps[2].state, "active");
  assert.equal(approved.steps[3].state, "locked");
  assert.match(
    approved.steps[3].hint ?? "",
    /данные для выплат|условия сотрудничества/i,
  );

  // Explicit application href is respected
  const applyReady = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "free",
    applicationHref: "/author-dashboard/commercial-application",
  });
  assert.equal(applyReady.steps[0].state, "active");
  assert.equal(applyReady.steps[0].actionLabel, "Подать заявку");
  assert.equal(
    applyReady.steps[0].href,
    "/author-dashboard/commercial-application",
  );

  // Requirements met unlocks paid create
  const requirementsMet = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial",
    capabilities: {
      applicationSubmissionAvailable: true,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsComplete: true,
    termsAccepted: true,
  });
  assert.equal(requirementsMet.steps[1].state, "completed");
  assert.equal(requirementsMet.steps[2].state, "completed");
  assert.equal(requirementsMet.steps[3].state, "active");
  assert.equal(requirementsMet.steps[3].actionLabel, "Создать платный продукт");

  // 10. Paid draft created
  const paidDraft = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial",
    capabilities: {
      applicationSubmissionAvailable: true,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsComplete: true,
    termsAccepted: true,
    products: [
      product(
        {
          id: "paid-1",
          is_free: false,
          status: "draft",
          slug: "paid-praktika",
        },
        emptyDraftReadiness(),
      ),
    ],
  });
  assert.equal(paidDraft.steps[3].state, "completed");
  assert.equal(paidDraft.steps[4].state, "active");
  assert.equal(paidDraft.focusPaidProductId, "paid-1");

  // 11. Paid product previewed / ready to publish
  const paidReady = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial",
    capabilities: {
      applicationSubmissionAvailable: true,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsComplete: true,
    termsAccepted: true,
    products: [
      product(
        {
          id: "paid-1",
          is_free: false,
          status: "draft",
          slug: "paid-praktika",
        },
        readyPaidReadiness(),
      ),
    ],
  });
  assert.equal(paidReady.steps[4].state, "completed");
  assert.equal(paidReady.steps[5].state, "active");
  assert.match(paidReady.steps[5].href ?? "", /preview=publish/);

  // 12. First paid product published
  const paidPublished = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial",
    capabilities: {
      applicationSubmissionAvailable: true,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsComplete: true,
    termsAccepted: true,
    products: [
      product(
        {
          id: "paid-1",
          is_free: false,
          status: "published",
          slug: "paid-praktika",
        },
        readyPaidReadiness(),
      ),
    ],
  });
  assert.equal(paidPublished.steps[5].state, "completed");
  assert.equal(paidPublished.steps[6].state, "active");
  assert.equal(paidPublished.steps[6].actionLabel, "Создать ссылку");

  // 13. Promo link for paid product
  const paidPromo = evaluateCommercial({
    freeGateReady: true,
    accessStatus: "commercial",
    capabilities: {
      applicationSubmissionAvailable: true,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsComplete: true,
    termsAccepted: true,
    products: [
      product(
        {
          id: "paid-1",
          is_free: false,
          status: "published",
          slug: "paid-praktika",
        },
        readyPaidReadiness(),
      ),
    ],
    campaigns: [
      {
        id: "campaign-paid",
        status: "active",
        practice_id: "paid-1",
        practice_status: "published",
      },
    ],
  });
  assert.equal(paidPromo.complete, true);
  assert.equal(paidPromo.completedCount, 7);
  assert.equal(paidPromo.steps[6].state, "completed");
}

function main() {
  testHasUserAuthorAvatar();
  testProfileMinimum();
  testPublishReadinessShared();
  testFocusProductSelection();
  testEmptyAuthor();
  testPartialAndFullProfile();
  testFreeProductGate();
  testPreparePublishPromotionAndComplete();
  testUiPreferenceStorage();
  testSourceGuards();
  testCommercialScenarios();
  console.log("author-onboarding-checklist-unit: ok");
}

main();
