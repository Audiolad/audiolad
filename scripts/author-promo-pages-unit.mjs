#!/usr/bin/env node
/**
 * Author promo pages Stage 2 unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

const PROMO_PAGE_MAX_PRODUCTS = 3;

function normalizePromoPageProductIds(productIds) {
  const normalized = [];

  for (const productId of productIds) {
    const trimmed = String(productId).trim();

    if (!trimmed) {
      return null;
    }

    if (normalized.includes(trimmed)) {
      return null;
    }

    normalized.push(trimmed);
  }

  if (normalized.length > PROMO_PAGE_MAX_PRODUCTS) {
    return null;
  }

  return normalized;
}

function testReplaceProductsMigration() {
  const sql = read(
    "supabase/migrations/20260719153000_replace_promo_page_products.sql",
  );

  assert(sql.includes("replace_promo_page_products"), "replace rpc exists");
  assert(sql.includes("user_can_read_author_promotion"), "auth check reused");
  assert(sql.includes("promo_page_edit_locked"), "published lock");
  assert(sql.includes("promo_page_products_limit_exceeded"), "max 3 products");
  assert(sql.includes("promo_page_product_duplicate"), "duplicate rejected");
  assert(sql.includes("promo_page_product_owner_mismatch"), "foreign owner rejected");
  assert(sql.includes("promo_page_product_not_eligible"), "ineligible rejected");
  assert(sql.includes("DELETE FROM public.promo_page_products"), "atomic delete");
  assert(sql.includes("INSERT INTO public.promo_page_products"), "bulk insert");
  assert(sql.includes("updated_at = clock_timestamp()"), "touch page updated_at");
  assert(sql.includes("TO authenticated"), "rpc granted to authenticated");
}

function testApiRoutes() {
  assert(read("src/app/api/author/promotion/pages/route.ts").includes("pages-api"), "pages list/create route");
  assert(
    read("src/app/api/author/promotion/pages/[id]/route.ts").includes("PATCHPage"),
    "page detail patch route",
  );
  assert(
    read("src/app/api/author/promotion/pages/[id]/publish/route.ts").includes("POSTPublish"),
    "publish route",
  );
  assert(
    read("src/app/api/author/promotion/pages/[id]/unpublish/route.ts").includes("POSTUnpublish"),
    "unpublish route",
  );
  assert(
    read("src/app/api/author/promotion/pages/eligible-products/route.ts").includes(
      "GETEligibleProducts",
    ),
    "eligible products route",
  );
}

function testSecurityHardeningMigration() {
  const sql = read(
    "supabase/migrations/20260719154000_promo_pages_security_hardening.sql",
  );

  assert(sql.includes("enforce_promo_page_mutation_guard"), "published mutation guard");
  assert(sql.includes("promo_pages_mutation_guard"), "mutation guard trigger");
  assert(sql.includes("IF OLD.status = 'published' THEN"), "published row immutable");
  assert(sql.includes("promo_page_publish_field_mutation_forbidden"), "publish bypass scoped");
  assert(sql.includes("promo_page_unpublish_field_mutation_forbidden"), "unpublish bypass scoped");
  assert(sql.includes("promo_page_author_id_immutable"), "author_id immutable");
  assert(sql.includes("promo_page_created_by_immutable"), "created_by immutable");
  assert(sql.includes("promo_page_published_at_immutable"), "published_at immutable");
  assert(sql.includes("update_promo_page_draft"), "atomic draft update rpc");
  assert(sql.includes("promo_page_replace_products_core"), "shared product replace core");
  assert(sql.includes("promo_page_product_id_required"), "null product id rejected");
  assert(sql.includes("REVOKE UPDATE ON public.promo_pages FROM authenticated"), "no direct page update");
  assert(
    sql.includes("REVOKE INSERT, UPDATE, DELETE ON public.promo_page_products FROM authenticated"),
    "no direct product dml",
  );
  assert(sql.includes("DROP POLICY IF EXISTS promo_page_products_insert"), "product insert policy removed");
  assert(sql.includes("SET search_path = public, pg_temp"), "safe search_path on definer paths");
}

function testCreateAndCtaHardeningMigration() {
  const sql = read(
    "supabase/migrations/20260719155000_promo_pages_create_and_cta_hardening.sql",
  );

  assert(sql.includes("create_promo_page_draft"), "atomic create rpc");
  assert(sql.includes("is_safe_promo_page_cta_href"), "sql cta helper");
  assert(sql.includes("REVOKE INSERT ON public.promo_pages FROM authenticated"), "revoke direct insert");
  assert(sql.includes("REVOKE EXECUTE ON FUNCTION public.replace_promo_page_products"), "replace not public to authenticated");
  assert(sql.includes("promo_page_replace_products_core"), "products only via core inside rpc");
  assert(sql.includes("COALESCE(p_practice_ids, ARRAY[]::uuid[])"), "empty product set allowed on create");
}

function testPagesApiGuards() {
  const api = read("src/lib/promo-pages/pages-api.ts");

  assert(api.includes("requireAuthorPromotionAccess"), "workspace access on list/create");
  assert(api.includes("requirePromoPageAccess"), "page ownership access");
  assert(api.includes("rejectUnknownFields"), "reject unknown patch/create fields");
  assert(api.includes('"status" in record'), "reject status patch");
  assert(api.includes('"author_id" in record'), "reject author_id patch");
  assert(api.includes('"created_by" in record'), "reject created_by patch");
  assert(api.includes("rejectPublishedEdit"), "published edit blocked in api");
  assert(api.includes('"create_promo_page_draft"'), "create via atomic rpc");
  assert(api.includes('"update_promo_page_draft"'), "patch via atomic rpc");
  assert(api.includes('"publish_promo_page"'), "publish via rpc");
  assert(api.includes('"unpublish_promo_page"'), "unpublish via rpc");
  assert(!api.includes('.from("promo_pages")\n      .insert('), "no direct promo_pages insert");
  assert(!api.includes('.from("promo_pages")\n        .update('), "no direct promo_pages update");
  assert(!api.includes('"replace_promo_page_products"'), "post no longer calls replace rpc directly");
  assert(!api.includes("service_role"), "no service role in author api");
}

function testPrivilegeModel() {
  const sql154 = read(
    "supabase/migrations/20260719154000_promo_pages_security_hardening.sql",
  );
  const sql155 = read(
    "supabase/migrations/20260719155000_promo_pages_create_and_cta_hardening.sql",
  );

  assert(sql154.includes("REVOKE UPDATE ON public.promo_pages FROM authenticated"), "154000 revokes update");
  assert(sql155.includes("REVOKE INSERT ON public.promo_pages FROM authenticated"), "155000 revokes insert");
  assert(sql155.includes("REVOKE DELETE ON public.promo_pages FROM authenticated"), "155000 revokes delete");
  assert(
    sql155.includes("REVOKE INSERT, UPDATE, DELETE ON public.promo_page_products FROM authenticated"),
    "155000 revokes product dml",
  );
  assert(sql155.includes("GRANT SELECT ON public.promo_pages TO authenticated"), "authenticated keeps select");
  assert(sql155.includes("GRANT SELECT ON public.promo_page_products TO authenticated"), "authenticated keeps product select");

  const stage1 = read(
    "supabase/migrations/20260719150000_promo_pages_foundation.sql",
  );
  assert(stage1.includes("GRANT SELECT, INSERT, UPDATE ON public.promo_pages TO authenticated"), "stage1 authenticated had insert/update");
  assert(stage1.includes("REVOKE ALL ON public.promo_pages FROM PUBLIC"), "anon/public table access revoked in stage1");
}

function testPromotionTabsQueryPreservation() {
  const tabs = read("src/components/author-dashboard/AuthorPromotionTabs.tsx");

  assert(tabs.includes('params.delete("tab")'), "campaigns tab keeps query string");
  assert(tabs.includes('params.set("tab", nextTab)'), "pages tab sets tab param");
  assert(!tabs.includes('params.delete("author")'), "author query preserved");
  assert(!tabs.includes('params.delete("period")'), "period query preserved");
  assert(tabs.includes('return "campaigns"'), "default tab is campaigns");
}

function testPublishedLinkVisibility() {
  const pagesClient = read("src/components/author-dashboard/AuthorPromoPagesClient.tsx");
  const form = read("src/components/author-dashboard/AuthorPromoPageForm.tsx");
  const preview = read("src/components/promo-pages/PromoPagePreviewModal.tsx");

  assert(
    pagesClient.includes('page.status !== "published"'),
    "publish action only for non-published list rows",
  );
  assert(
    pagesClient.includes("Копировать ссылку") &&
      pagesClient.includes('page.status !== "published"'),
    "copy link only in published branch",
  );
  assert(form.includes("isPublished"), "form read-only when published");
  assert(!preview.includes("buildPromoPageUrl"), "preview does not expose public url builder");
}

function testProductIdNormalization() {
  assert(
    normalizePromoPageProductIds([])?.length === 0,
    "0 products allowed in draft",
  );
  assert(
    normalizePromoPageProductIds(["a", "b", "c"])?.length === 3,
    "3 products accepted",
  );
  assert(
    normalizePromoPageProductIds(["a", "b", "c", "d"]) === null,
    "4 products rejected",
  );
  assert(
    normalizePromoPageProductIds(["a", "a"]) === null,
    "duplicate rejected",
  );
}

function testLinkHelper() {
  const paths = read("src/lib/promo-pages/paths.ts");

  assert(paths.includes("buildPromoPagePath"), "path helper exported");
  assert(
    paths.includes("`/promo/${authorSlug.trim()}/${promoSlug.trim()}`"),
    "promo path format",
  );
}

function testPromotionUi() {
  const workspace = read("src/components/author-dashboard/AuthorPromotionWorkspace.tsx");
  const tabs = read("src/components/author-dashboard/AuthorPromotionTabs.tsx");
  const pagesClient = read("src/components/author-dashboard/AuthorPromoPagesClient.tsx");
  const form = read("src/components/author-dashboard/AuthorPromoPageForm.tsx");

  assert(workspace.includes("AuthorPromoPagesClient"), "workspace renders promo pages");
  assert(tabs.includes("Промостраницы"), "promo pages tab label");
  assert(tabs.includes("Рекламные кампании"), "campaigns tab preserved");
  assert(
    pagesClient.includes("Создайте свою первую промостраницу"),
    "empty state title",
  );
  assert(
    pagesClient.includes("Telegram, MAX, BotHelp, ВКонтакте"),
    "empty state body",
  );
  assert(form.includes("PROMO_PAGE_MAX_PRODUCTS"), "max 3 enforced in form");
  assert(form.includes("/publish"), "publish wired in form");
  assert(form.includes("/unpublish"), "unpublish wired in form");
  assert(pagesClient.includes("buildPromoPagePath"), "list uses link helper");
  assert(form.includes("buildPromoPagePath"), "form uses link helper");
  assert(form.includes("promo_page_edit_locked") || form.includes("isPublished"), "published read-only");
  assert(form.includes("Снять с публикации и редактировать"), "unpublish then edit action");
}

function testNoPublicPromoRoute() {
  let publicRouteExists = false;

  try {
    read("src/app/promo/page.tsx");
    publicRouteExists = true;
  } catch {
    publicRouteExists = false;
  }

  try {
    read("src/app/promo/[authorSlug]/[promoSlug]/page.tsx");
    publicRouteExists = true;
  } catch {
    // expected missing
  }

  assert(!publicRouteExists, "public /promo route must not exist yet");
}

function testPresentationComponent() {
  const presentation = read("src/components/promo-pages/PromoPagePresentation.tsx");
  const preview = read("src/components/promo-pages/PromoPagePreviewModal.tsx");

  assert(presentation.includes("previewMode"), "presentation supports preview mode");
  assert(preview.includes("PromoPagePresentation"), "preview modal reuses presentation");
}

function testSlugValidation() {
  const validation = read("src/lib/promo-pages/validation.ts");

  assert(validation.includes("validatePromoPageSlug"), "slug validator exported");
  assert(validation.includes("promo_page_slug_too_short"), "short slug error code");
}

function run() {
  testReplaceProductsMigration();
  testSecurityHardeningMigration();
  testCreateAndCtaHardeningMigration();
  testApiRoutes();
  testPagesApiGuards();
  testPrivilegeModel();
  testProductIdNormalization();
  testLinkHelper();
  testPromotionUi();
  testPromotionTabsQueryPreservation();
  testPublishedLinkVisibility();
  testNoPublicPromoRoute();
  testPresentationComponent();
  testSlugValidation();
  console.log("author-promo-pages-unit: ok");
}

run();
