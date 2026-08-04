#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_PRODUCT_FREE_PRICE_LABEL,
  buildAuthorNewProductHref,
  FREE_AUTHOR_FIRST_PRODUCT_BANNER,
  FREE_AUTHOR_PRODUCTS_EMPTY_STATE,
  PAID_PRICING_FREE_AUTHOR_HINT,
  shouldShowAuthorTermsRequiredBanner,
  shouldShowFreeAuthorFirstProductBanner,
  STARTER_FREE_PRODUCT_BEFORE_COMMERCIAL_HINT,
} from "../src/lib/author-dashboard/free-author-first-step.ts";
import {
  getAuthorAccessBannerMessage,
  getPaidPricingDisabledReason,
} from "../src/lib/authors/access.ts";
import { resolveAuthorStatusView } from "../src/lib/author-dashboard/author-status.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

// 1–3. free author sees first-product CTA, not terms→commercial funnel
assert.equal(shouldShowAuthorTermsRequiredBanner("free"), false);
assert.equal(shouldShowAuthorTermsRequiredBanner("commercial_pending"), false);
assert.equal(shouldShowAuthorTermsRequiredBanner("commercial_onboarding"), true);
assert.equal(shouldShowAuthorTermsRequiredBanner("commercial_active"), true);

assert.equal(shouldShowFreeAuthorFirstProductBanner("free", 0), true);
assert.equal(shouldShowFreeAuthorFirstProductBanner("free", -1), false);
assert.equal(shouldShowFreeAuthorFirstProductBanner("free", 2), false);
assert.equal(shouldShowFreeAuthorFirstProductBanner("commercial_pending", 0), true);
assert.equal(
  shouldShowFreeAuthorFirstProductBanner("commercial_onboarding", 0),
  false,
);

assert.equal(
  FREE_AUTHOR_FIRST_PRODUCT_BANNER.ctaLabel,
  "Создать бесплатный продукт",
);
assert.equal(
  buildAuthorNewProductHref("ol-ga"),
  "/author-dashboard/products/new?author=ol-ga",
);
assert.match(FREE_AUTHOR_FIRST_PRODUCT_BANNER.body, /только для продажи/i);

const bannerSource = read(
  "src/components/author-dashboard/AuthorTermsRequiredBanner.tsx",
);
assert.match(bannerSource, /shouldShowFreeAuthorFirstProductBanner/);
assert.match(bannerSource, /FREE_AUTHOR_FIRST_PRODUCT_BANNER/);
assert.doesNotMatch(
  bannerSource,
  /accessStatus === "free"[\s\S]*commercial\/terms/,
);

// For free authors, terms CTA must not be the only path — commercial/terms
// remains only inside the commercial-approved branch.
assert.ok(bannerSource.includes("commercial/terms"));
assert.ok(bannerSource.includes("shouldShowAuthorTermsRequiredBanner"));

// 4–6. Free label + paid disabled copy
assert.equal(AUTHOR_PRODUCT_FREE_PRICE_LABEL, "Бесплатно");
assert.match(
  getPaidPricingDisabledReason("free") ?? "",
  /только для продажи/i,
);
assert.match(
  getPaidPricingDisabledReason("free") ?? "",
  /уже сейчас/i,
);
assert.equal(getPaidPricingDisabledReason("free"), PAID_PRICING_FREE_AUTHOR_HINT);
assert.equal(getPaidPricingDisabledReason("commercial_active"), null);

const formSource = read(
  "src/components/author-dashboard/AuthorProductForm.tsx",
);
assert.match(formSource, /AUTHOR_PRODUCT_FREE_PRICE_LABEL/);
assert.doesNotMatch(formSource, /В подарок/);
assert.match(formSource, /isFree: true/);
assert.match(formSource, /!canUsePaidPricing/);
assert.match(formSource, /PAID_PRICING_COMMERCIAL_STATUS_MORE_LABEL/);
assert.match(formSource, /buildAuthorStatusHref/);
assert.doesNotMatch(
  formSource,
  /paidPricingDisabledReason[\s\S]{0,200}commercial-application/,
);

// 7. commercial_active / onboarding still get terms flow helpers
assert.equal(shouldShowAuthorTermsRequiredBanner("commercial_active"), true);
assert.match(
  getAuthorAccessBannerMessage("commercial_onboarding") ?? "",
  /Примите Авторские условия/i,
);
assert.match(
  getPaidPricingDisabledReason("commercial_onboarding") ?? "",
  /условия сотрудничества/i,
);

const dashboard = read(
  "src/components/author-dashboard/AuthorDashboardClient.tsx",
);
assert.match(dashboard, /FREE_AUTHOR_PRODUCTS_EMPTY_STATE\.title/);
assert.match(dashboard, /FREE_AUTHOR_PRODUCTS_EMPTY_STATE\.body/);
assert.match(dashboard, /FREE_AUTHOR_PRODUCTS_EMPTY_STATE\.ctaLabel/);
assert.doesNotMatch(dashboard, /Создайте свою первую практику/);
assert.match(dashboard, /accessStatus=\{selectedAuthor\.accessStatus\}/);
assert.equal(
  FREE_AUTHOR_PRODUCTS_EMPTY_STATE.title,
  "Создайте первый бесплатный продукт",
);

// Status page gated commercial CTA
const status = resolveAuthorStatusView({
  accessStatus: "free",
  applicationStatus: null,
  applicationSubmittedAt: null,
  applicationReviewComment: null,
  termsAccepted: false,
  publishedTermsAvailable: true,
  payoutProfileStatus: null,
  payoutReviewComment: null,
  individualShare: null,
  role: "owner",
  authorSlug: "demo-author",
  hasPublishedFreeProduct: false,
});
assert.equal(status.cta.disabled, true);
assert.equal(status.cta.href, null);
assert.equal(status.cta.hint, STARTER_FREE_PRODUCT_BEFORE_COMMERCIAL_HINT);
assert.equal(status.secondaryCtas[0]?.label, "Создать бесплатный продукт");
assert.match(status.secondaryCtas[0]?.href ?? "", /products\/new/);

assert.match(
  getAuthorAccessBannerMessage("free") ?? "",
  /только для продажи платных/i,
);

// 8. mobile/desktop share same copy sources (no alternate gift label in form)
assert.equal((formSource.match(/Бесплатно|AUTHOR_PRODUCT_FREE_PRICE_LABEL/g) || []).length >= 1, true);

console.log("free-author-first-step-unit: ok");
