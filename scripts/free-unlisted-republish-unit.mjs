#!/usr/bin/env node
/**
 * Regression: start_practice_editing must preserve catalog visibility,
 * and published free + unlisted ordinary practices must classify as free
 * on the public PDP without becoming a Buy / «Стоимость уточняется» state.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import {
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusLabel,
} from "../src/lib/author-products/moderation.ts";
import { applyOrdinaryCatalogEligibility } from "../src/lib/catalog/visibility-query.ts";
import {
  canAcquirePractice,
  resolveProductAccess,
} from "../src/lib/products/access.ts";
import {
  isOrdinaryCatalogEligible,
  parseCatalogVisibility,
  resolvePracticeRobots,
} from "../src/lib/products/catalog-visibility.ts";
import { getProductPriceLabel } from "../src/lib/products/price-format.ts";
import { buildPracticeAccessPresentation } from "../src/lib/products/practice-access-ui.ts";
import {
  canRevealPublicProductPage,
} from "../src/lib/products/publish-preview.ts";
import { BUY_ACTION_LABEL } from "../src/lib/ui/action-labels.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase/migrations");
const NEW_MIGRATION =
  "20260915120000_preserve_catalog_visibility_on_start_editing.sql";
const POTOK_ID = "7f7da757-9191-4e3d-95c0-02834321ad35";

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function anonClient() {
  return {
    from() {
      throw new Error("anonymous path must not query supabase");
    },
  };
}

function extractLatestFunction(name) {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let latest = null;

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
    const idx = sql.lastIndexOf(marker);
    if (idx === -1) {
      continue;
    }
    const rest = sql.slice(idx);
    const end = rest.indexOf("\n$$;");
    assert.notEqual(end, -1, `${file} must close ${name} with $$;`);
    latest = { file, body: rest.slice(0, end + 4) };
  }

  assert.ok(latest, `latest ${name} definition must exist`);
  return latest;
}

function extractUpdateSet(functionBody) {
  const match = functionBody.match(
    /UPDATE public\.practices AS p\s+SET\s+([\s\S]*?)\s+WHERE p\.id/,
  );
  assert.ok(match, "function must UPDATE public.practices");
  return match[1];
}

function applyStartEditing(row) {
  return {
    ...row,
    status: "unpublished",
    moderation_status: "not_submitted",
    moderation_review_comment: null,
    moderation_submitted_at: null,
  };
}

function applyApproveAndPublish(row) {
  return {
    ...row,
    status: "published",
    moderation_status: "approved",
    is_catalog_listed: row.is_catalog_listed ?? true,
    catalog_visibility: parseCatalogVisibility(
      row.catalog_visibility,
      row.is_catalog_listed ?? true,
    ),
  };
}

function baseProduct(overrides = {}) {
  return {
    id: "practice-1",
    author_id: "author-1",
    slug: "potok-izobiliya",
    price: 0,
    is_free: true,
    format: "Аудиопрактика",
    status: "published",
    is_catalog_listed: true,
    catalog_visibility: "listed",
    guest_access_enabled: false,
    product_kind: PRODUCT_KIND.PRACTICE,
    publication_class: "practice",
    audio_url: "https://cdn.example/audio.mp3",
    ...overrides,
  };
}

function guestAccess(overrides = {}) {
  return {
    canListen: false,
    canAcquire: true,
    isPubliclyListed: true,
    reason: "not_authenticated",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
    canSeeSelectedUsers: false,
    ...overrides,
  };
}

function presentationFor(practice, access) {
  return buildPracticeAccessPresentation({
    access,
    practice,
    authorSlug: "sabarova-ol-ga",
    paymentsConfigured: true,
    isAuthenticated: false,
  });
}

function testLifecycleSqlPreservesVisibility() {
  const latest = extractLatestFunction("start_practice_editing");
  assert.equal(latest.file, NEW_MIGRATION);
  const setClause = extractUpdateSet(latest.body);
  assert.match(setClause, /status = 'unpublished'/);
  assert.doesNotMatch(setClause, /is_catalog_listed/);
  assert.doesNotMatch(setClause, /catalog_visibility/);
  assert.doesNotMatch(latest.body, /published_at\s*=/);

  const newSql = read(`supabase/migrations/${NEW_MIGRATION}`);
  assert.match(newSql, /CREATE OR REPLACE FUNCTION public\.start_practice_editing/);
  assert.doesNotMatch(newSql, /is_catalog_listed\s*=\s*false/);
  assert.doesNotMatch(
    newSql,
    /CREATE OR REPLACE FUNCTION public\.approve_and_publish_practice/,
  );

  const historical = read(
    "supabase/migrations/20260902120200_author_support_mode.sql",
  );
  const historicalFn = historical.slice(
    historical.indexOf("CREATE OR REPLACE FUNCTION public.start_practice_editing"),
    historical.indexOf("CREATE OR REPLACE FUNCTION public.soft_delete_practice"),
  );
  assert.match(historicalFn, /is_catalog_listed = false/);

  const approve = extractLatestFunction("approve_and_publish_practice");
  assert.match(
    approve.body,
    /COALESCE\(v_practice\.is_catalog_listed, true\)/,
  );
  assert.doesNotMatch(
    approve.body,
    /is_catalog_listed\s*=\s*true(?!\s*,|\s*\))/,
  );

  const listedPublished = {
    status: "published",
    is_catalog_listed: true,
    catalog_visibility: "listed",
    moderation_status: "approved",
  };
  const listedEditing = applyStartEditing(listedPublished);
  assert.equal(listedEditing.status, "unpublished");
  assert.equal(listedEditing.is_catalog_listed, true);
  assert.equal(listedEditing.catalog_visibility, "listed");
  const listedRepublished = applyApproveAndPublish(listedEditing);
  assert.equal(listedRepublished.status, "published");
  assert.equal(listedRepublished.is_catalog_listed, true);
  assert.equal(listedRepublished.catalog_visibility, "listed");

  const unlistedPublished = {
    status: "published",
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
    moderation_status: "approved",
  };
  const unlistedEditing = applyStartEditing(unlistedPublished);
  assert.equal(unlistedEditing.status, "unpublished");
  assert.equal(unlistedEditing.is_catalog_listed, false);
  assert.equal(unlistedEditing.catalog_visibility, "unlisted");
  const unlistedRepublished = applyApproveAndPublish(unlistedEditing);
  assert.equal(unlistedRepublished.status, "published");
  assert.equal(unlistedRepublished.is_catalog_listed, false);
  assert.equal(unlistedRepublished.catalog_visibility, "unlisted");

  const selectedPublished = {
    status: "published",
    is_catalog_listed: false,
    catalog_visibility: "selected_users",
    moderation_status: "approved",
  };
  const selectedEditing = applyStartEditing(selectedPublished);
  assert.equal(selectedEditing.catalog_visibility, "selected_users");
  assert.equal(selectedEditing.is_catalog_listed, false);
  const selectedRepublished = applyApproveAndPublish(selectedEditing);
  assert.equal(selectedRepublished.catalog_visibility, "selected_users");
  assert.equal(selectedRepublished.is_catalog_listed, false);
}

function testRepairSqlIsOneRowAndNotAMigration() {
  const repair = read("scripts/repair-potok-izobiliya.sql");
  assert.match(repair, new RegExp(POTOK_ID));
  assert.match(repair, /slug = 'potok-izobiliya'/);
  assert.match(repair, /catalog_visibility = 'listed'/);
  assert.match(repair, /catalog_visibility = 'unlisted'/);
  assert.equal(
    (repair.match(/UPDATE public\.practices/g) ?? []).length,
    1,
  );
  assert.match(
    repair,
    /WHERE id = '7f7da757-9191-4e3d-95c0-02834321ad35'/,
  );
  const migrations = readdirSync(migrationsDir).join("\n");
  assert.doesNotMatch(migrations, /repair-potok-izobiliya/);
}

async function testFreeListedPdp() {
  const product = baseProduct();
  const access = await resolveProductAccess(anonClient(), product, null);
  assert.equal(access.reason, "free");
  assert.equal(access.canListen, true);
  assert.equal(access.canAcquire, false);
  assert.equal(access.isPubliclyListed, true);

  const ui = presentationFor(product, access);
  assert.equal(ui.primaryAction.kind, "listen");
  assert.equal(ui.primaryAction.label, "Начать слушать");
  assert.notEqual(ui.primaryAction.kind, "buy");
  assert.doesNotMatch(ui.statusBadge, /Стоимость уточняется/);
  assert.notEqual(ui.primaryAction.label, BUY_ACTION_LABEL);
}

async function testFreeUnlistedPdp() {
  const product = baseProduct({
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
  });
  const access = await resolveProductAccess(anonClient(), product, null);
  assert.equal(access.reason, "free");
  assert.equal(access.canListen, true);
  assert.equal(access.canAcquire, false);
  assert.equal(access.isPubliclyListed, false);

  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: product.status,
      access,
      catalogVisibility: product.catalog_visibility,
      isCatalogListed: product.is_catalog_listed,
    }),
    true,
  );

  const ui = presentationFor(product, access);
  assert.equal(ui.primaryAction.kind, "listen");
  assert.equal(ui.primaryAction.label, "Начать слушать");
  assert.notEqual(ui.primaryAction.kind, "buy");
  assert.doesNotMatch(ui.statusBadge, /Стоимость уточняется/);
  assert.doesNotMatch(JSON.stringify(ui), /Купить/);

  const robots = resolvePracticeRobots({
    published: true,
    catalogVisibility: "unlisted",
    isCatalogListed: false,
  });
  assert.deepEqual(robots, { index: false, follow: true });
}

async function testPaidListedBuyPath() {
  const product = baseProduct({
    is_free: false,
    price: 990,
  });
  const access = await resolveProductAccess(anonClient(), product, null);
  assert.equal(access.canListen, false);
  assert.equal(access.canAcquire, true);
  assert.equal(access.reason, "not_authenticated");

  const ui = presentationFor(product, access);
  assert.equal(ui.primaryAction.kind, "buy");
  assert.equal(ui.primaryAction.label, BUY_ACTION_LABEL);
  assert.equal(ui.primaryAction.disabled, false);
  assert.equal(ui.primaryAction.productPriceMinorSnapshot, 99000);
  assert.doesNotMatch(ui.statusBadge, /Стоимость уточняется/);
}

async function testPaidMissingPriceIsNotPurchasable() {
  const product = baseProduct({
    is_free: false,
    price: null,
  });
  const access = guestAccess({
    canListen: false,
    canAcquire: true,
    reason: "not_authenticated",
  });
  const ui = presentationFor(product, access);
  assert.notEqual(ui.primaryAction.kind, "buy");
  assert.equal(ui.statusBadge, "Стоимость уточняется");

  const zeroPrice = presentationFor(
    baseProduct({ is_free: false, price: 0 }),
    access,
  );
  assert.notEqual(zeroPrice.primaryAction.kind, "buy");
}

async function testSelectedUsersFreeStaysPrivate() {
  const product = baseProduct({
    is_catalog_listed: false,
    catalog_visibility: "selected_users",
  });
  const access = await resolveProductAccess(anonClient(), product, null);
  assert.equal(access.canListen, false);
  assert.equal(access.canAcquire, false);
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: product.status,
      access,
      catalogVisibility: product.catalog_visibility,
      isCatalogListed: product.is_catalog_listed,
    }),
    false,
  );

  const ui = presentationFor(product, access);
  assert.notEqual(ui.primaryAction.kind, "buy");
  assert.notEqual(ui.primaryAction.kind, "listen");
}

async function testAudioPostUnlistedFreeUnchanged() {
  const product = baseProduct({
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
    product_kind: PRODUCT_KIND.AUDIO_POST,
  });
  const access = await resolveProductAccess(anonClient(), product, null);
  assert.equal(access.canListen, true);
  assert.equal(access.reason, "free");
  assert.equal(access.canAcquire, false);
  assert.equal(access.isPubliclyListed, false);
}

function testListingsKeepUnlistedOut() {
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "published",
      catalogVisibility: "unlisted",
      isCatalogListed: false,
    }),
    false,
  );
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "published",
      catalogVisibility: "listed",
      isCatalogListed: true,
    }),
    true,
  );

  const calls = [];
  const query = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    or(filters) {
      calls.push(["or", filters]);
      return this;
    },
    not(column, operator, value) {
      calls.push(["not", column, operator, value]);
      return this;
    },
  };
  applyOrdinaryCatalogEligibility(query);
  assert.deepEqual(calls, [
    ["eq", "status", "published"],
    ["eq", "catalog_visibility", "listed"],
  ]);

  const authorPage = read("src/lib/authors/public-page.ts");
  assert.match(authorPage, /\.eq\("is_catalog_listed", true\)/);
  const catalog = read("src/lib/products/catalog.ts");
  assert.match(catalog, /applyOrdinaryCatalogEligibility/);
  const sitemap = read("src/lib/seo/sitemap-data.ts");
  assert.match(sitemap, /\.eq\("is_catalog_listed", true\)/);
}

function testCheckoutRpcUnchanged() {
  const order = extractLatestFunction("create_practice_order");
  assert.match(order.body, /v_practice\.is_free IS TRUE/);
  assert.match(order.body, /practice_not_for_sale/);
}

function testModerationLabelsStayLive() {
  assert.equal(
    getVisibleAuthorProductStatusLabel(
      getVisibleAuthorProductStatus({
        status: "published",
        moderationStatus: "approved",
        deletedAt: null,
      }),
    ),
    "Опубликован",
  );
  assert.equal(getProductPriceLabel(0, true), "Подарок");
}

function testPresentationFailSafeIgnoresWrongAccess() {
  const product = baseProduct({
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
  });
  const ui = presentationFor(
    product,
    guestAccess({
      canListen: false,
      canAcquire: true,
      isPubliclyListed: false,
      reason: "not_authenticated",
    }),
  );
  assert.equal(ui.primaryAction.kind, "listen");
  assert.equal(ui.primaryAction.label, "Начать слушать");
}

function testPaidUnlistedStillAcquirable() {
  const product = baseProduct({
    is_free: false,
    price: 1500,
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
  });
  assert.equal(canAcquirePractice(product), true);
}

async function main() {
  testLifecycleSqlPreservesVisibility();
  testRepairSqlIsOneRowAndNotAMigration();
  await testFreeListedPdp();
  await testFreeUnlistedPdp();
  await testPaidListedBuyPath();
  await testPaidMissingPriceIsNotPurchasable();
  await testSelectedUsersFreeStaysPrivate();
  await testAudioPostUnlistedFreeUnchanged();
  testListingsKeepUnlistedOut();
  testCheckoutRpcUnchanged();
  testModerationLabelsStayLive();
  testPresentationFailSafeIgnoresWrongAccess();
  testPaidUnlistedStillAcquirable();
  console.log("free-unlisted-republish-unit: ok");
}

await main();
