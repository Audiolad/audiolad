#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  evaluatePublishReadiness,
} from "../src/lib/author-products/publish.ts";
import {
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
} from "../src/lib/author-dashboard/commercial-onboarding.ts";
import {
  evaluateAuthorOnboardingChecklist,
} from "../src/lib/author-dashboard/onboarding-checklist.ts";
import {
  ONBOARDING_COMPACT_GRACE_MS,
  buildAuthorOnboardingUiState,
  parseOnboardingUiHideBody,
  planOnboardingUiEpochSync,
  resolveChecklistPresentation,
  resolveOnboardingHideDecision,
  shouldBridgeLegacyOnboardingDismiss,
} from "../src/lib/author-dashboard/onboarding-ui-state.ts";

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

function readyPaidReadiness() {
  return evaluatePublishReadiness(
    basePractice({ is_free: false, price: 990 }),
    [baseAudio()],
    { accessStatus: "commercial", activeTopicCount: 1 },
  );
}

function product(overrides = {}, readiness = readyReadiness()) {
  return {
    id: "practice-1",
    title: "Практика",
    slug: "praktika",
    status: "draft",
    is_free: true,
    price: 0,
    updated_at: "2026-07-01T10:00:00.000Z",
    readiness,
    ...overrides,
  };
}

function completeProfile() {
  return {
    short_positioning: "Позиционирование",
    full_bio: "О себе",
    avatar_url: "https://cdn.example/avatar.jpg",
  };
}

function hoursFrom(iso, hours) {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function testPresentationRules() {
  const now = "2026-09-05T12:00:00.000Z";
  const twoDaysAgo = hoursFrom(now, -48);
  const fourDaysAgo = hoursFrom(now, -96);

  assert.equal(
    resolveChecklistPresentation({
      complete: false,
      completedAt: null,
      hiddenAt: null,
      now,
    }),
    "expanded",
    "free incomplete → expanded",
  );
  assert.equal(
    resolveChecklistPresentation({
      complete: false,
      completedAt: fourDaysAgo,
      hiddenAt: twoDaysAgo,
      now,
    }),
    "expanded",
    "incomplete cannot compact even with old timestamps",
  );
  assert.equal(
    resolveChecklistPresentation({
      complete: true,
      completedAt: twoDaysAgo,
      hiddenAt: null,
      now,
    }),
    "expanded",
    "complete < 3 days → expanded",
  );
  assert.equal(
    resolveChecklistPresentation({
      complete: true,
      completedAt: twoDaysAgo,
      hiddenAt: now,
      now,
    }),
    "compact",
    "complete < 3 days + hide now → compact",
  );
  assert.equal(
    resolveChecklistPresentation({
      complete: true,
      completedAt: fourDaysAgo,
      hiddenAt: null,
      now,
    }),
    "compact",
    "complete > 3 days → compact",
  );
  assert.equal(ONBOARDING_COMPACT_GRACE_MS, 3 * 24 * 60 * 60 * 1000);
}

function testEpochStampAndReset() {
  const firstNow = "2026-09-01T10:00:00.000Z";
  const laterNow = "2026-09-02T10:00:00.000Z";
  const againNow = "2026-09-03T10:00:00.000Z";

  const firstComplete = planOnboardingUiEpochSync({
    complete: true,
    completedAt: null,
    hiddenAt: null,
    nowIso: firstNow,
  });
  assert.deepEqual(firstComplete, {
    completedAt: firstNow,
    hiddenAt: null,
  });

  const repeatGet = planOnboardingUiEpochSync({
    complete: true,
    completedAt: firstNow,
    hiddenAt: null,
    nowIso: laterNow,
  });
  assert.deepEqual(repeatGet, {
    completedAt: firstNow,
    hiddenAt: null,
  });

  const afterHide = planOnboardingUiEpochSync({
    complete: true,
    completedAt: firstNow,
    hiddenAt: laterNow,
    nowIso: laterNow,
  });
  assert.deepEqual(afterHide, {
    completedAt: firstNow,
    hiddenAt: laterNow,
  });

  const incomplete = planOnboardingUiEpochSync({
    complete: false,
    completedAt: firstNow,
    hiddenAt: laterNow,
    nowIso: laterNow,
  });
  assert.deepEqual(incomplete, {
    completedAt: null,
    hiddenAt: null,
  });

  const completeAgain = planOnboardingUiEpochSync({
    complete: true,
    completedAt: null,
    hiddenAt: null,
    nowIso: againNow,
  });
  assert.deepEqual(completeAgain, {
    completedAt: againNow,
    hiddenAt: null,
  });
}

function testIndependentPresentation() {
  const now = "2026-09-05T12:00:00.000Z";
  const twoDaysAgo = hoursFrom(now, -48);

  const mixed = buildAuthorOnboardingUiState({
    freeComplete: true,
    commercialComplete: false,
    row: {
      free_completed_at: twoDaysAgo,
      free_hidden_at: now,
      commercial_completed_at: null,
      commercial_hidden_at: null,
    },
    now,
  });
  assert.equal(mixed.free.presentation, "compact");
  assert.equal(mixed.commercial.presentation, "expanded");

  const bothCompact = buildAuthorOnboardingUiState({
    freeComplete: true,
    commercialComplete: true,
    row: {
      free_completed_at: hoursFrom(now, -96),
      free_hidden_at: null,
      commercial_completed_at: hoursFrom(now, -96),
      commercial_hidden_at: null,
    },
    now,
  });
  assert.equal(bothCompact.free.presentation, "compact");
  assert.equal(bothCompact.commercial.presentation, "compact");
}

function testOptionalPayoutDoesNotAffectCommercialComplete() {
  const paidPromo = evaluateCommercialOnboardingChecklist({
    authorSlug: "demo-author",
    accessStatus: "commercial",
    freeGateReady: true,
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
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      termsAcceptanceAvailable: true,
    },
    termsAccepted: true,
    payoutDetailsComplete: false,
    payoutProfileStatus: null,
  });

  assert.equal(paidPromo.complete, true);
  assert.equal(paidPromo.completedCount, 6);
  assert.equal(
    paidPromo.steps.find((step) => step.id === "payout_details")?.statusLabel,
    "Не заполнено",
  );

  const now = "2026-09-05T12:00:00.000Z";
  const ui = buildAuthorOnboardingUiState({
    freeComplete: true,
    commercialComplete: paidPromo.complete,
    row: {
      free_completed_at: hoursFrom(now, -24),
      free_hidden_at: null,
      commercial_completed_at: hoursFrom(now, -24),
      commercial_hidden_at: null,
    },
    now,
  });
  assert.equal(ui.commercial.presentation, "expanded");
}

function testHideApiContract() {
  assert.deepEqual(resolveOnboardingHideDecision({ complete: true }), {
    ok: true,
  });
  assert.deepEqual(resolveOnboardingHideDecision({ complete: false }), {
    ok: false,
    status: 409,
    error: "checklist_incomplete",
  });

  assert.deepEqual(
    parseOnboardingUiHideBody({
      author_id: "author-1",
      checklist: "free",
    }),
    { ok: true, authorId: "author-1", checklist: "free" },
  );
  assert.deepEqual(
    parseOnboardingUiHideBody({
      author_id: "author-1",
      checklist: "commercial",
      action: "hide",
    }),
    { ok: true, authorId: "author-1", checklist: "commercial" },
  );
  assert.equal(
    parseOnboardingUiHideBody({
      author_id: "author-1",
      checklist: "free",
      action: "show",
    }).ok,
    false,
  );
  assert.equal(
    parseOnboardingUiHideBody({
      author_id: "author-1",
      checklist: "free",
      action: "expand",
    }).ok,
    false,
  );
  assert.equal(parseOnboardingUiHideBody({ checklist: "free" }).ok, false);
  assert.equal(
    parseOnboardingUiHideBody({ author_id: "author-1", checklist: "all" }).ok,
    false,
  );
}

function testLegacyBridge() {
  assert.deepEqual(
    shouldBridgeLegacyOnboardingDismiss({
      dismissed: true,
      freeComplete: true,
      commercialComplete: true,
      freeHiddenAt: null,
      commercialHiddenAt: null,
    }),
    ["free", "commercial"],
  );
  assert.deepEqual(
    shouldBridgeLegacyOnboardingDismiss({
      dismissed: true,
      freeComplete: true,
      commercialComplete: false,
      freeHiddenAt: null,
      commercialHiddenAt: null,
    }),
    [],
    "never trust localStorage without server complete for both",
  );
  assert.deepEqual(
    shouldBridgeLegacyOnboardingDismiss({
      dismissed: false,
      freeComplete: true,
      commercialComplete: true,
      freeHiddenAt: null,
      commercialHiddenAt: null,
    }),
    [],
  );
  assert.deepEqual(
    shouldBridgeLegacyOnboardingDismiss({
      dismissed: true,
      freeComplete: true,
      commercialComplete: true,
      freeHiddenAt: "2026-09-01T00:00:00.000Z",
      commercialHiddenAt: null,
    }),
    ["commercial"],
  );
}

function testFreeFiveOfFiveAndCommercialIncomplete() {
  const freeComplete = evaluateAuthorOnboardingChecklist({
    authorId: "author-1",
    authorSlug: "demo-author",
    profile: completeProfile(),
    products: [
      product(
        { status: "published", is_free: true, price: 0 },
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
  assert.equal(freeComplete.complete, true);
  assert.equal(freeComplete.completedCount, 5);

  const commercialIncomplete = evaluateCommercialOnboardingChecklist({
    authorSlug: "demo-author",
    accessStatus: "commercial",
    freeGateReady: true,
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
    campaigns: [],
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      termsAcceptanceAvailable: true,
    },
    termsAccepted: true,
  });
  assert.equal(commercialIncomplete.complete, false);
  assert.equal(commercialIncomplete.completedCount, 5);
  assert.equal(commercialIncomplete.totalCount, 6);

  const now = "2026-09-05T12:00:00.000Z";
  const ui = buildAuthorOnboardingUiState({
    freeComplete: freeComplete.complete,
    commercialComplete: commercialIncomplete.complete,
    row: {
      free_completed_at: hoursFrom(now, -96),
      free_hidden_at: null,
      commercial_completed_at: null,
      commercial_hidden_at: null,
    },
    now,
  });
  assert.equal(ui.free.presentation, "compact");
  assert.equal(ui.commercial.presentation, "expanded");
}

function testSourceGuards() {
  const migration = read(
    "supabase/migrations/20260905120000_author_onboarding_ui_state.sql",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.author_onboarding_ui_state/);
  assert.match(migration, /author_id uuid PRIMARY KEY/);
  assert.match(migration, /REFERENCES public\.authors \(id\) ON DELETE CASCADE/);
  assert.match(migration, /free_completed_at timestamptz NULL/);
  assert.match(migration, /free_hidden_at timestamptz NULL/);
  assert.match(migration, /commercial_completed_at timestamptz NULL/);
  assert.match(migration, /commercial_hidden_at timestamptz NULL/);
  assert.match(migration, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.author_onboarding_ui_state FROM anon/);
  assert.match(migration, /author_members/);
  assert.match(migration, /GRANT ALL ON TABLE public\.author_onboarding_ui_state TO service_role/);
  assert.match(migration, /COALESCE\(free_completed_at, now\(\)\)/);
  assert.match(migration, /sync_author_onboarding_ui_completion/);
  assert.match(migration, /hide_author_onboarding_checklist/);
  assert.doesNotMatch(migration, /force_expanded/);
  assert.doesNotMatch(migration, /author_settings/);

  const getRoute = read("src/app/api/author/onboarding/route.ts");
  assert.match(getRoute, /requireAuthorMembership/);
  assert.match(getRoute, /syncAuthorOnboardingUiState/);
  assert.match(getRoute, /checklist\.complete/);
  assert.match(getRoute, /checklist\.commercial\.complete/);

  const patchRoute = read("src/app/api/author/onboarding/ui/route.ts");
  assert.match(patchRoute, /export async function PATCH/);
  assert.match(patchRoute, /requireAuthorMembership/);
  assert.match(patchRoute, /handleAuthorRouteError/);
  assert.match(patchRoute, /parseOnboardingUiHideBody/);
  assert.match(patchRoute, /resolveOnboardingHideDecision/);
  assert.match(patchRoute, /hideAuthorOnboardingChecklist/);
  assert.match(patchRoute, /loadAuthorOnboardingChecklistState/);
  assert.doesNotMatch(patchRoute, /export async function GET/);
  assert.doesNotMatch(patchRoute, /force_expanded/);
  assert.doesNotMatch(patchRoute, /action === ["']show["']/);
  assert.doesNotMatch(patchRoute, /action === ["']expand["']/);

  const auth = read("src/lib/author-products/auth.ts");
  assert.match(auth, /AuthorAccessError\("unauthorized", 401\)/);
  assert.match(
    auth,
    /if \(!data \|\| \(data\.role !== "owner" && data\.role !== "editor"\)\) \{\s*throw new AuthorAccessError\("forbidden", 403\)/,
  );
  assert.match(auth, /handleAuthorRouteError/);

  const store = read("src/lib/author-dashboard/onboarding-ui-store.ts");
  assert.match(store, /createServiceRoleClient/);
  assert.match(store, /sync_author_onboarding_ui_completion/);
  assert.match(store, /hide_author_onboarding_checklist/);

  const checklistUi = read(
    "src/components/author-dashboard/AuthorOnboardingChecklist.tsx",
  );
  assert.match(checklistUi, /localShow/);
  assert.match(checklistUi, /setLocalShow\(\(current\) => \(\{ \.\.\.current, free: true \}\)\)/);
  assert.match(
    checklistUi,
    /setLocalShow\(\(current\) => \(\{ \.\.\.current, commercial: true \}\)\)/,
  );
  assert.match(checklistUi, /setLocalShow\(DEFAULT_LOCAL_SHOW\)/);
  assert.match(checklistUi, /Свернуть/);
  assert.match(checklistUi, /Скрыть сейчас/);
  assert.match(checklistUi, /data-onboarding-zone="compact"/);
  assert.match(
    checklistUi,
    /onShow=\{\(\) => setLocalShow\(\(current\) => \(\{ \.\.\.current, free: true \}\)\)\}/,
  );
  assert.match(
    checklistUi,
    /label="Свернуть"[\s\S]*setLocalShow\(\(current\) => \(\{ \.\.\.current, free: false \}\)\)/,
  );
  assert.match(
    checklistUi,
    /method:\s*["']PATCH["'][\s\S]*checklist: kind/,
  );
  assert.doesNotMatch(
    checklistUi,
    /Показать[\s\S]{0,80}hideChecklist/,
  );

  const dashboard = read(
    "src/components/author-dashboard/AuthorDashboardClient.tsx",
  );
  assert.match(dashboard, /Возможности для авторов/);
  assert.match(dashboard, /AuthorOnboardingChecklist/);
  assert.match(dashboard, /AuthorAccessStatusBanner/);
  assert.match(dashboard, /AuthorTermsRequiredBanner/);

  const productsApi = read("src/app/api/author/products/route.ts");
  const commercialApi = read(
    "src/app/api/author/commercial-application/route.ts",
  );
  const termsApi = read("src/app/api/author/terms/route.ts");
  const payoutApi = read("src/app/api/author/payout-profile/route.ts");
  assert.doesNotMatch(productsApi, /onboarding-ui-state/);
  assert.doesNotMatch(commercialApi, /onboarding-ui-state/);
  assert.doesNotMatch(termsApi, /onboarding-ui-state/);
  assert.doesNotMatch(payoutApi, /onboarding-ui-state/);

  const evaluators = read("src/lib/author-dashboard/onboarding-checklist.ts");
  const commercial = read("src/lib/author-dashboard/commercial-onboarding.ts");
  assert.doesNotMatch(evaluators, /free_completed_at/);
  assert.doesNotMatch(commercial, /commercial_completed_at/);
}

function main() {
  testPresentationRules();
  testEpochStampAndReset();
  testIndependentPresentation();
  testOptionalPayoutDoesNotAffectCommercialComplete();
  testHideApiContract();
  testLegacyBridge();
  testFreeFiveOfFiveAndCommercialIncomplete();
  testSourceGuards();
  console.log("author-onboarding-ui-unit: ok");
}

main();
