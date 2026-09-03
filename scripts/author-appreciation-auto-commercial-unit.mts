#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveAuthorAppreciationVisibility,
} from "../src/lib/author-appreciation/effective-visibility";
import { canReceiveCanonicalAppreciationAccrual } from "../src/lib/author-appreciation/finance-eligibility";
import {
  isAppreciationCurrentTermsSatisfied,
  isOwnerControlledAuthorWorkspace,
} from "../src/lib/authors/owner-controlled";

const commercialVisible = {
  surface: "author" as const,
  currentTermsAccepted: true,
  accessStatus: "commercial_active",
  settings: { enabled: true, profileEnabled: true, freeProductsDefault: true },
};

const freePractice = {
  status: "published",
  isFree: true,
  publicationClass: "practice",
  productKind: "practice",
  catalogVisibility: "listed",
  isCatalogListed: true,
  override: null,
};

function termsSatisfied(input: {
  currentTermsAccepted: boolean;
  ownerControlled: boolean;
}) {
  return isAppreciationCurrentTermsSatisfied(input);
}

assert.equal(isOwnerControlledAuthorWorkspace(true), true);
assert.equal(isOwnerControlledAuthorWorkspace(false), false);
assert.equal(isOwnerControlledAuthorWorkspace(null), false);

{
  // Auto-commercial / owner-controlled class: no stored Author Terms row
  const ownerControlled = true;
  const accepted = termsSatisfied({
    currentTermsAccepted: false,
    ownerControlled,
  });
  assert.equal(accepted, true, "owner-controlled satisfies current terms for appreciation");
  assert.equal(
    resolveAuthorAppreciationVisibility({
      ...commercialVisible,
      currentTermsAccepted: accepted,
    }),
    true,
    "author-page CTA visible for auto-commercial class",
  );
  assert.equal(
    resolveAuthorAppreciationVisibility({
      surface: "product",
      currentTermsAccepted: accepted,
      accessStatus: "commercial_active",
      settings: commercialVisible.settings,
      product: freePractice,
    }),
    true,
    "FREE practice CTA visible",
  );
  assert.equal(
    resolveAuthorAppreciationVisibility({
      surface: "product",
      currentTermsAccepted: accepted,
      accessStatus: "commercial_active",
      settings: commercialVisible.settings,
      product: { ...freePractice, productKind: "music", publicationClass: "release" },
    }),
    true,
    "FREE music CTA visible",
  );
  assert.equal(
    resolveAuthorAppreciationVisibility({
      surface: "product",
      currentTermsAccepted: accepted,
      accessStatus: "commercial_active",
      settings: commercialVisible.settings,
      product: { ...freePractice, productKind: "audio_post", publicationClass: "post" },
    }),
    true,
    "FREE audio_post CTA visible",
  );
  assert.equal(
    canReceiveCanonicalAppreciationAccrual({
      payoutEligible: true,
      commercialTermsFound: true,
    }),
    true,
    "canonical finance accrual ready after lifecycle bootstrap",
  );
}

{
  // Ordinary EXTERNAL commercial author: no owner-controlled bypass
  const accepted = termsSatisfied({
    currentTermsAccepted: false,
    ownerControlled: false,
  });
  assert.equal(accepted, false);
  assert.equal(
    resolveAuthorAppreciationVisibility({
      ...commercialVisible,
      currentTermsAccepted: accepted,
    }),
    false,
    "external commercial without current terms stays hidden",
  );
  assert.equal(
    resolveAuthorAppreciationVisibility({
      surface: "product",
      currentTermsAccepted: accepted,
      accessStatus: "commercial_active",
      settings: commercialVisible.settings,
      product: freePractice,
    }),
    false,
  );
}

{
  // Existing restrictions still apply to owner-controlled class
  const accepted = termsSatisfied({
    currentTermsAccepted: false,
    ownerControlled: true,
  });
  assert.equal(
    resolveAuthorAppreciationVisibility({
      ...commercialVisible,
      currentTermsAccepted: accepted,
      settings: { ...commercialVisible.settings, enabled: false },
    }),
    false,
  );
  assert.equal(
    resolveAuthorAppreciationVisibility({
      surface: "product",
      currentTermsAccepted: accepted,
      accessStatus: "commercial_active",
      settings: commercialVisible.settings,
      product: { ...freePractice, isFree: false },
    }),
    false,
    "paid products stay off",
  );
  assert.equal(
    resolveAuthorAppreciationVisibility({
      surface: "product",
      currentTermsAccepted: accepted,
      accessStatus: "commercial_active",
      settings: commercialVisible.settings,
      product: { ...freePractice, publicationClass: "course", productKind: "course" },
    }),
    false,
    "courses stay off",
  );
}

{
  const ownerControlled = readFileSync("src/lib/authors/owner-controlled.ts", "utf8");
  assert.match(ownerControlled, /can_bypass_product_moderation|canBypassProductModeration/);
  assert.doesNotMatch(ownerControlled, /Зоя Петрова|Сергей и Зоя|zoya-petrova|sergey-and-zoya/);
  assert.doesNotMatch(
    ownerControlled,
    /8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0|50ee125c-8951-4ac6-819a-3f6b11150008/,
  );

  const currentTerms = readFileSync(
    "src/lib/author-appreciation/current-terms.ts",
    "utf8",
  );
  assert.match(currentTerms, /isAppreciationCurrentTermsSatisfied/);
  assert.match(currentTerms, /can_bypass_product_moderation/);
  assert.doesNotMatch(currentTerms, /Зоя Петрова|Сергей и Зоя/);

  const lifecycle = readFileSync(
    "src/lib/authors/ensure-auto-commercial-lifecycle.ts",
    "utf8",
  );
  assert.match(lifecycle, /ensureCommercialPayeeSetupAfterTerms/);
  assert.match(lifecycle, /AUTO_COMMERCIAL_PAYEE_SETUP_NOTES|default_after_auto_commercial_activation/);
  assert.match(lifecycle, /isOwnerControlledAuthorWorkspace/);
  assert.doesNotMatch(lifecycle, /Зоя Петрова|Сергей и Зоя/);

  const checkout = readFileSync(
    "src/app/api/author-appreciation/checkout/route.ts",
    "utf8",
  );
  assert.match(checkout, /ensureAutoCommercialAppreciationLifecycle/);
  assert.match(checkout, /can_bypass_product_moderation/);
  assert.match(checkout, /hasAcceptedCurrentAppreciationTerms/);
  assert.doesNotMatch(checkout, /scheduleGetCourseAppreciationReconcile/);

  const payee = readFileSync("src/lib/authors/ensure-commercial-payee-setup.ts", "utf8");
  assert.match(payee, /AUTHOR_COMMERCIAL_SHARE_BPS/);
  assert.match(payee, /approveImmediately:\s*true/);
}

console.log("author-appreciation-auto-commercial-unit: ok");
