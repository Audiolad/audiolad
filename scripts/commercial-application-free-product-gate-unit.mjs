#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_CODE,
  COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_MESSAGE,
  canSubmitCommercialApplicationWithProducts,
  commercialApplicationSubmitRequiresPublishedFree,
  hasPublishedFreeProductForCommercialGate,
  isPublishedFreeProductForCommercialGate,
} from "../src/lib/author-commercial-applications/free-product-gate.ts";
import { mapCommercialApplicationRpcError } from "../src/lib/author-commercial-applications/validation.ts";
import { resolveAuthorStatusView } from "../src/lib/author-dashboard/author-status.ts";
import { evaluateAuthorOnboardingChecklist } from "../src/lib/author-dashboard/onboarding-checklist.ts";

assert.equal(
  COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_CODE,
  "commercial_application_free_product_required",
);
assert.match(
  COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_MESSAGE,
  /опубликуйте хотя бы один бесплатный продукт/i,
);
assert.equal(
  mapCommercialApplicationRpcError(
    "commercial_application_free_product_required",
  ),
  COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_MESSAGE,
);

assert.equal(
  isPublishedFreeProductForCommercialGate({
    status: "published",
    is_free: true,
    price: 0,
  }),
  true,
);
assert.equal(
  isPublishedFreeProductForCommercialGate({
    status: "draft",
    is_free: true,
    price: 0,
  }),
  false,
);
assert.equal(
  isPublishedFreeProductForCommercialGate({
    status: "published",
    is_free: false,
    price: 0,
  }),
  false,
);
assert.equal(
  isPublishedFreeProductForCommercialGate({
    status: "published",
    is_free: true,
    price: 500,
  }),
  false,
);
assert.equal(
  isPublishedFreeProductForCommercialGate({
    status: "published",
    is_free: true,
    price: 0,
    deleted_at: "2026-08-04T00:00:00.000Z",
  }),
  false,
);
assert.equal(
  isPublishedFreeProductForCommercialGate({
    status: "unpublished",
    is_free: true,
    price: 0,
  }),
  false,
);

assert.equal(commercialApplicationSubmitRequiresPublishedFree(null), true);
assert.equal(commercialApplicationSubmitRequiresPublishedFree("draft"), true);
assert.equal(
  commercialApplicationSubmitRequiresPublishedFree("needs_changes"),
  false,
);
assert.equal(
  canSubmitCommercialApplicationWithProducts({
    applicationStatus: "needs_changes",
    products: [],
  }),
  true,
);
assert.equal(
  canSubmitCommercialApplicationWithProducts({
    applicationStatus: null,
    products: [],
  }),
  false,
);

function emptyReadiness() {
  return {
    ok: false,
    completedCount: 0,
    totalCount: 1,
    requirements: [{ key: "title", label: "Название", ok: false }],
    firstFailure: { code: "missing_title", message: "x" },
  };
}

function readyReadiness() {
  return {
    ok: true,
    completedCount: 1,
    totalCount: 1,
    requirements: [{ key: "title", label: "Название", ok: true }],
    firstFailure: null,
  };
}

function product(overrides = {}) {
  return {
    id: "p1",
    title: "Продукт",
    slug: "produkt",
    status: "draft",
    is_free: true,
    price: 0,
    updated_at: "2026-08-04T00:00:00.000Z",
    readiness: emptyReadiness(),
    ...overrides,
  };
}

const profile = {
  short_positioning: "Автор практик",
  full_bio: "Подробное описание автора для страницы.",
  avatar_url: "https://cdn.example/authors/a/avatar.jpg",
};

// draft free + published paid must NOT unlock commercial
{
  const state = evaluateAuthorOnboardingChecklist({
    authorId: "a1",
    authorSlug: "author",
    profile,
    products: [
      product({ id: "free-draft", status: "draft", is_free: true, price: 0 }),
      product({
        id: "paid-pub",
        status: "published",
        is_free: false,
        price: 990,
        readiness: readyReadiness(),
      }),
    ],
    campaigns: [],
  });
  assert.equal(state.readyForCommercial, false);
  assert.equal(
    state.steps.find((step) => step.id === "publish_product")?.completed,
    false,
  );
}

// one published free unlocks
{
  const state = evaluateAuthorOnboardingChecklist({
    authorId: "a1",
    authorSlug: "author",
    profile,
    products: [
      product({
        id: "free-pub",
        status: "published",
        is_free: true,
        price: 0,
        readiness: readyReadiness(),
      }),
    ],
    campaigns: [],
  });
  assert.equal(state.readyForCommercial, true);
  assert.equal(
    state.steps.find((step) => step.id === "publish_product")?.completed,
    true,
  );
}

// status CTA gated without published free
{
  const gated = resolveAuthorStatusView({
    accessStatus: "free",
    applicationStatus: null,
    termsAccepted: false,
    publishedTermsAvailable: true,
    payoutProfileStatus: null,
    role: "owner",
    authorSlug: "author",
    hasPublishedFreeProduct: false,
  });
  assert.equal(gated.cta.disabled, true);
  assert.equal(gated.cta.href, null);
  assert.equal(
    gated.cta.hint,
    COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_MESSAGE,
  );
  assert.equal(gated.secondaryCtas[0]?.label, "Создать бесплатный продукт");
  assert.match(
    gated.secondaryCtas[0]?.href ?? "",
    /\/author-dashboard\/products\/new/,
  );
}

// status CTA open with published free
{
  const open = resolveAuthorStatusView({
    accessStatus: "free",
    applicationStatus: null,
    termsAccepted: false,
    publishedTermsAvailable: true,
    payoutProfileStatus: null,
    role: "owner",
    authorSlug: "author",
    hasPublishedFreeProduct: true,
  });
  assert.equal(open.cta.disabled, false);
  assert.match(open.cta.href ?? "", /commercial-application/);
}

assert.equal(
  hasPublishedFreeProductForCommercialGate([
    { status: "submitted", is_free: true, price: 0 },
  ]),
  false,
);

console.log("commercial-application-free-product-gate-unit: ok");
