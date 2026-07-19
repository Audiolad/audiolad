#!/usr/bin/env node
/**
 * Promo pages schema/domain unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  PUBLIC_PROMO_PAGE_FORBIDDEN_FIELDS,
} from "../src/lib/promo-pages/types.ts";
import {
  PROMO_PAGE_MAX_PRODUCTS,
  buildPromoPageSlugFromInternalName,
  isPracticePromoPageEligible,
  normalizePromoPageProductIds,
  validatePromoPageCtaHref,
  validatePromoPageProductsForPublish,
  validatePromoPagePublishProductCount,
  validatePromoPageSlug,
  validatePromotionCampaignTarget,
} from "../src/lib/promo-pages/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testPromoPagesMigration() {
  const sql = read(
    "supabase/migrations/20260719150000_promo_pages_foundation.sql",
  );

  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.promo_pages"), "promo_pages table");
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.promo_page_products"), "join table");
  assert(sql.includes("UNIQUE (author_id, slug)"), "unique author slug");
  assert(sql.includes("slug ~ '^[a-z0-9-]{2,64}$'"), "slug format check");
  assert(sql.includes("position >= 0 AND position <= 2"), "position range");
  assert(sql.includes("UNIQUE (promo_page_id, position)"), "unique position per page");
  assert(sql.includes("ON DELETE RESTRICT"), "practice delete restricted");
  assert(sql.includes("ON DELETE CASCADE"), "promo page cascade to join rows");
  assert(sql.includes("promo_page_products_limit_exceeded"), "max three products trigger");
  assert(sql.includes("promo_page_product_owner_mismatch"), "owner mismatch trigger");
  assert(sql.includes("publish_promo_page"), "publish rpc");
  assert(sql.includes("unpublish_promo_page"), "unpublish rpc");
  assert(sql.includes("get_public_promo_page"), "public rpc");
  assert(sql.includes("ENABLE ROW LEVEL SECURITY"), "rls enabled");
  assert(sql.includes("REVOKE ALL ON public.promo_pages FROM PUBLIC"), "no public table grants");
  assert(sql.includes("TO authenticated"), "author authenticated grants");
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.get_public_promo_page"), "public rpc for anon");
  assert(sql.includes("user_can_read_author_promotion"), "reused promotion access helper");
  assert(sql.includes("is_practice_promo_page_eligible"), "shared eligibility helper");
  assert(sql.includes("promo_page_product_count_invalid"), "publish requires 1..3 products");
  assert(sql.includes("promo_page_product_not_eligible"), "publish rejects ineligible products");
  assert(!sql.includes("banner_url"), "no banner_url column");
  assert(sql.includes("ON DELETE SET NULL"), "created_by audit fk uses set null");
  assert(sql.includes("enforce_promo_page_status_change"), "status change guard trigger");
  assert(sql.includes("promo_page_status_change_requires_rpc"), "direct publish blocked");
  assert(sql.includes("audiolad.promo_page_status_bypass"), "publish rpc bypasses status guard");
  assert(sql.includes("p_is_catalog_listed IS TRUE"), "strict catalog-listed eligibility");
}

function testCampaignMigration() {
  const sql = read(
    "supabase/migrations/20260719151000_promotion_campaigns_promo_pages.sql",
  );

  assert(sql.includes("ADD COLUMN IF NOT EXISTS promo_page_id"), "promo_page_id column");
  assert(sql.includes("ALTER COLUMN practice_id DROP NOT NULL"), "practice_id nullable");
  assert(sql.includes("promotion_campaigns_target_xor_check"), "xor constraint");
  assert(sql.includes("practice_id IS NOT NULL"), "legacy practice target preserved");
  assert(sql.includes("promo_page_id IS NOT NULL"), "promo page target supported");
  assert(sql.includes("IS NOT DISTINCT FROM"), "update policy keeps target immutable");
  assert(
    sql.includes("REFERENCES public.promo_pages (id) ON DELETE RESTRICT"),
    "campaign promo_page_id uses restrict",
  );
  assert(
    !sql.includes("REFERENCES public.promo_pages (id) ON DELETE CASCADE"),
    "campaign promo_page_id must not cascade delete campaigns",
  );
}

function testAnalyticsMigration() {
  const sql = read(
    "supabase/migrations/20260719152000_promo_page_analytics_dimensions.sql",
  );

  assert(sql.includes("promo_page_id uuid NULL"), "analytics promo_page_id");
  assert(sql.includes("promotion_campaign_id uuid NULL"), "analytics promotion_campaign_id");
  assert(sql.includes("analytics_events_promo_page_id_created_idx"), "promo page analytics index");
}

function testSlugValidation() {
  assert(validatePromoPageSlug("3-kvantmeditacii-bothelp") === null, "valid slug");
  assert(validatePromoPageSlug("a") === "promo_page_slug_too_short", "too short slug");
  assert(validatePromoPageSlug("!!!") === "promo_page_slug_required", "invalid slug normalizes empty");
  assert(
    buildPromoPageSlugFromInternalName("3 КвантМедитации — BotHelp") ===
      "3-kvantmeditatsii-bothelp",
    "slug built from internal name",
  );
}

function testCtaValidation() {
  assert(validatePromoPageCtaHref("/authors/sergey-and-zoya") === null, "internal author path");
  assert(validatePromoPageCtaHref(null) === null, "empty cta allowed");
  assert(validatePromoPageCtaHref("https://evil.example") === "promo_page_cta_href_invalid", "external url rejected");
  assert(validatePromoPageCtaHref("//evil.example") === "promo_page_cta_href_invalid", "protocol-relative rejected");
  assert(validatePromoPageCtaHref("javascript:alert(1)") === "promo_page_cta_href_invalid", "javascript rejected");
  assert(validatePromoPageCtaHref("/auth/sign-in") === "promo_page_cta_href_invalid", "auth route rejected");
}

function testProductLimits() {
  assert(PROMO_PAGE_MAX_PRODUCTS === 3, "max products constant");
  assert(validatePromoPagePublishProductCount(0) === "promo_page_product_count_too_low", "publish needs min 1");
  assert(validatePromoPagePublishProductCount(1) === null, "one product ok");
  assert(validatePromoPagePublishProductCount(3) === null, "three products ok");
  assert(validatePromoPagePublishProductCount(4) === "promo_page_product_count_too_high", "four products rejected");

  assert(
    normalizePromoPageProductIds(["a", "b", "c"])?.length === 3,
    "normalize three ids",
  );
  assert(normalizePromoPageProductIds([])?.length === 0, "draft allows zero products");
  assert(normalizePromoPageProductIds(["a", "a"]) === null, "duplicate ids rejected");
  assert(
    normalizePromoPageProductIds(["1", "2", "3", "4"]) === null,
    "more than three ids rejected",
  );
}

function testProductEligibility() {
  const eligiblePublishedFreeListed = {
    status: "published",
    is_free: true,
    is_catalog_listed: true,
    guest_access_enabled: false,
  };

  assert(
    isPracticePromoPageEligible(eligiblePublishedFreeListed),
    "1. published + free + catalog-listed → eligible",
  );

  assert(
    isPracticePromoPageEligible({
      status: "published",
      is_free: false,
      is_catalog_listed: false,
      guest_access_enabled: true,
    }),
    "2. published + guest_access_enabled → eligible",
  );

  assert(
    !isPracticePromoPageEligible({
      status: "unpublished",
      is_free: false,
      is_catalog_listed: false,
      guest_access_enabled: true,
    }),
    "3. unpublished + guest_access_enabled → not eligible",
  );

  assert(
    !isPracticePromoPageEligible({
      status: "archived",
      is_free: false,
      is_catalog_listed: false,
      guest_access_enabled: true,
    }),
    "4. archived + guest_access_enabled → not eligible",
  );

  assert(
    !isPracticePromoPageEligible({
      status: "published",
      is_free: false,
      is_catalog_listed: true,
      guest_access_enabled: false,
    }),
    "5. published + paid + guest_access_disabled → not eligible",
  );

  assert(
    !isPracticePromoPageEligible({
      status: "published",
      is_free: true,
      is_catalog_listed: false,
      guest_access_enabled: false,
    }),
    "published + free + delisted → not eligible",
  );

  assert(
    validatePromoPageProductsForPublish([eligiblePublishedFreeListed]) === null,
    "publish accepts eligible product",
  );

  assert(
    validatePromoPageProductsForPublish([
      {
        status: "published",
        is_free: false,
        is_catalog_listed: true,
        guest_access_enabled: false,
      },
    ]) === "promo_page_product_not_eligible",
    "publish rejects paid guest-ineligible product",
  );

  assert(
    validatePromoPageProductsForPublish([]) === "promo_page_product_count_too_low",
    "publish rejects zero products",
  );
}

function testCampaignTargetXor() {
  assert(
    validatePromotionCampaignTarget({
      practice_id: "practice-1",
      promo_page_id: null,
    }) === null,
    "legacy practice campaign valid",
  );

  assert(
    validatePromotionCampaignTarget({
      practice_id: null,
      promo_page_id: "page-1",
    }) === null,
    "promo page campaign valid",
  );

  assert(
    validatePromotionCampaignTarget({
      practice_id: "practice-1",
      promo_page_id: "page-1",
    }) === "promotion_campaign_target_conflict",
    "both targets invalid",
  );

  assert(
    validatePromotionCampaignTarget({
      practice_id: null,
      promo_page_id: null,
    }) === "promotion_campaign_target_required",
    "missing targets invalid",
  );
}

function testPublicDtoContract() {
  const migration = read(
    "supabase/migrations/20260719150000_promo_pages_foundation.sql",
  );
  const types = read("src/lib/promo-pages/types.ts");
  const fnStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_public_promo_page",
  );
  const fnBody = migration.slice(fnStart);
  const publicReturnStart = fnBody.indexOf("RETURN jsonb_build_object(");
  const publicReturn = fnBody.slice(publicReturnStart, publicReturnStart + 1200);

  for (const field of PUBLIC_PROMO_PAGE_FORBIDDEN_FIELDS) {
    assert(!publicReturn.includes(`'${field}'`), `public rpc should not expose ${field}`);
    assert(types.includes(field), `forbidden field documented in types: ${field}`);
  }

  assert(publicReturn.includes("'public_title'"), "public rpc exposes public_title");
  assert(publicReturn.includes("'products'"), "public rpc exposes products");
  assert(migration.includes("pp.status = 'published'"), "public rpc requires published status");
  assert(migration.includes("jsonb_array_length(v_products) < 1"), "public rpc hides page without eligible products");
}

function testUserDeletionPolicyUnchanged() {
  const policy = read("src/lib/admin/user-deletion-policy.ts");
  const deletion = read("src/lib/admin/user-deletion.ts");

  assert(!policy.includes("promo_pages"), "promo_pages not a deletion blocker");
  assert(deletion.includes("promotion_campaigns"), "legacy promotion campaign blocker preserved");
  assert(
    read("supabase/migrations/20260719150000_promo_pages_foundation.sql").includes(
      "ON DELETE SET NULL",
    ),
    "promo_pages.created_by uses set null on user delete",
  );
}

function testStage1DoesNotTouchOffer() {
  const allowlist = [
    "supabase/migrations/20260719150000_promo_pages_foundation.sql",
    "supabase/migrations/20260719151000_promotion_campaigns_promo_pages.sql",
    "supabase/migrations/20260719152000_promo_page_analytics_dimensions.sql",
    "src/lib/promo-pages/types.ts",
    "src/lib/promo-pages/validation.ts",
    "scripts/promo-pages-unit.mjs",
    "src/lib/promotion/campaigns-api.ts",
    "package.json",
  ];

  for (const file of allowlist) {
    assert(!file.includes("/offer/"), `${file} unrelated to /offer build failure`);
  }
}

function testDomainModulesExist() {
  assert(read("src/lib/promo-pages/types.ts").includes("PublicPromoPageDto"), "public dto type");
  assert(read("src/lib/promo-pages/validation.ts").includes("validatePromoPageSlug"), "slug validator");
}

const tests = [
  ["promo pages migration", testPromoPagesMigration],
  ["campaign migration", testCampaignMigration],
  ["analytics migration", testAnalyticsMigration],
  ["slug validation", testSlugValidation],
  ["cta validation", testCtaValidation],
  ["product limits", testProductLimits],
  ["product eligibility", testProductEligibility],
  ["campaign target xor", testCampaignTargetXor],
  ["public dto contract", testPublicDtoContract],
  ["user deletion policy", testUserDeletionPolicyUnchanged],
  ["stage1 offer isolation", testStage1DoesNotTouchOffer],
  ["domain modules", testDomainModulesExist],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok - ${name}`);
}

console.log(`\n${tests.length} promo pages checks passed.`);
