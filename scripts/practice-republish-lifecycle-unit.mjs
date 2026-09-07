#!/usr/bin/env node
/**
 * Practice republish lifecycle: unpublished+approved must POST /publish
 * without PATCH, unpublish must preserve catalog visibility, and Olga's
 * guarded listed-preference repair is a no-op on mismatch.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPracticePublicContentEditable,
  isPracticePublishedImmutableError,
  shouldSaveProductBeforePublish,
} from "../src/lib/author-products/moderation.ts";
import { parseCatalogVisibility } from "../src/lib/products/catalog-visibility.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase/migrations");
const NEW_MIGRATION =
  "20260929120000_preserve_catalog_visibility_on_unpublish.sql";
const OLGA_ID = "b8f16e12-c301-44f2-bd23-ec1eb387cb3d";

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
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

function applyUnpublish(row) {
  return {
    ...row,
    status: "unpublished",
  };
}

function applyPublishAudioProduct(row) {
  const catalogListed = row.is_catalog_listed ?? true;
  const event =
    row.status === "unpublished" && row.moderation_status === "approved"
      ? "republished"
      : null;

  return {
    ...row,
    status: "published",
    is_catalog_listed: catalogListed,
    catalog_visibility: parseCatalogVisibility(
      row.catalog_visibility,
      catalogListed,
    ),
    lastEvent: event,
  };
}

function applyOlgaRepair(row) {
  const matches =
    row.id === OLGA_ID &&
    row.status === "unpublished" &&
    row.moderation_status === "approved" &&
    row.is_catalog_listed === false &&
    row.catalog_visibility === "unlisted";

  if (!matches) {
    return row;
  }

  return {
    ...row,
    is_catalog_listed: true,
    catalog_visibility: "listed",
  };
}

function testUnpublishSqlPreservesVisibility() {
  const latest = extractLatestFunction("unpublish_approved_practice");
  assert.equal(latest.file, NEW_MIGRATION);
  const setClause = extractUpdateSet(latest.body);
  assert.match(setClause, /status = 'unpublished'/);
  assert.doesNotMatch(setClause, /is_catalog_listed/);
  assert.doesNotMatch(setClause, /catalog_visibility/);
  assert.doesNotMatch(latest.body, /published_at\s*=/);
  assert.doesNotMatch(latest.body, /moderation_status\s*=/);

  const newSql = read(`supabase/migrations/${NEW_MIGRATION}`);
  assert.match(
    newSql,
    /CREATE OR REPLACE FUNCTION public\.unpublish_approved_practice/,
  );
  assert.doesNotMatch(latest.body, /is_catalog_listed\s*=\s*false/);
  assert.doesNotMatch(setClause, /is_catalog_listed\s*=/);
  assert.doesNotMatch(
    newSql,
    /CREATE OR REPLACE FUNCTION public\.approve_and_publish_practice/,
  );
  assert.doesNotMatch(
    newSql,
    /CREATE OR REPLACE FUNCTION public\.publish_audio_product/,
  );
  assert.doesNotMatch(
    newSql,
    /CREATE OR REPLACE FUNCTION public\.start_practice_editing/,
  );
  assert.doesNotMatch(
    newSql,
    /CREATE OR REPLACE FUNCTION public\.unpublish_approved_practice_with_support_proof/,
  );

  const historical = read(
    "supabase/migrations/20260902120200_author_support_mode.sql",
  );
  const historicalFn = historical.slice(
    historical.indexOf(
      "CREATE OR REPLACE FUNCTION public.unpublish_approved_practice",
    ),
    historical.indexOf("CREATE OR REPLACE FUNCTION public.start_practice_editing"),
  );
  assert.match(historicalFn, /is_catalog_listed = false/);

  const wrapper = extractLatestFunction(
    "unpublish_approved_practice_with_support_proof",
  );
  assert.match(
    wrapper.body,
    /RETURN public\.unpublish_approved_practice\(p_practice_id\);/,
  );

  const publish = extractLatestFunction("publish_audio_product");
  assert.match(
    publish.body,
    /COALESCE\(v_practice\.is_catalog_listed, true\)/,
  );
  assert.match(
    publish.body,
    /IF v_from_status = 'unpublished' AND v_from_moderation = 'approved'/,
  );
  assert.match(publish.body, /'republished'/);
  assert.doesNotMatch(
    publish.body,
    /is_catalog_listed\s*=\s*true(?!\s*,|\s*\))/,
  );
}

function testUnpublishRepublishVisibilityCycles() {
  const listedPublished = {
    status: "published",
    is_catalog_listed: true,
    catalog_visibility: "listed",
    moderation_status: "approved",
  };
  const listedUnpublished = applyUnpublish(listedPublished);
  assert.equal(listedUnpublished.status, "unpublished");
  assert.equal(listedUnpublished.is_catalog_listed, true);
  assert.equal(listedUnpublished.catalog_visibility, "listed");
  assert.equal(listedUnpublished.moderation_status, "approved");
  const listedRepublished = applyPublishAudioProduct(listedUnpublished);
  assert.equal(listedRepublished.status, "published");
  assert.equal(listedRepublished.is_catalog_listed, true);
  assert.equal(listedRepublished.catalog_visibility, "listed");
  assert.equal(listedRepublished.moderation_status, "approved");
  assert.equal(listedRepublished.lastEvent, "republished");

  const unlistedPublished = {
    status: "published",
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
    moderation_status: "approved",
  };
  const unlistedUnpublished = applyUnpublish(unlistedPublished);
  assert.equal(unlistedUnpublished.is_catalog_listed, false);
  assert.equal(unlistedUnpublished.catalog_visibility, "unlisted");
  const unlistedRepublished = applyPublishAudioProduct(unlistedUnpublished);
  assert.equal(unlistedRepublished.status, "published");
  assert.equal(unlistedRepublished.is_catalog_listed, false);
  assert.equal(unlistedRepublished.catalog_visibility, "unlisted");
  assert.equal(unlistedRepublished.moderation_status, "approved");
  assert.equal(unlistedRepublished.lastEvent, "republished");

  const selectedPublished = {
    status: "published",
    is_catalog_listed: false,
    catalog_visibility: "selected_users",
    moderation_status: "approved",
  };
  const selectedUnpublished = applyUnpublish(selectedPublished);
  assert.equal(selectedUnpublished.catalog_visibility, "selected_users");
  assert.equal(selectedUnpublished.is_catalog_listed, false);
  const selectedRepublished = applyPublishAudioProduct(selectedUnpublished);
  assert.equal(selectedRepublished.catalog_visibility, "selected_users");
  assert.equal(selectedRepublished.is_catalog_listed, false);
  assert.equal(selectedRepublished.moderation_status, "approved");
  assert.equal(selectedRepublished.lastEvent, "republished");
}

function testOlgaGuardedRepair() {
  const newSql = read(`supabase/migrations/${NEW_MIGRATION}`);
  assert.match(newSql, new RegExp(OLGA_ID));
  assert.match(newSql, /catalog_visibility = 'listed'/);
  assert.match(newSql, /is_catalog_listed = true/);
  assert.match(newSql, /AND status = 'unpublished'/);
  assert.match(newSql, /AND moderation_status = 'approved'/);
  assert.match(newSql, /AND is_catalog_listed IS FALSE/);
  assert.match(newSql, /AND catalog_visibility = 'unlisted'/);
  assert.doesNotMatch(newSql, /status\s*=\s*'published'/);
  const repairStart = newSql.indexOf("Guarded one-row repair");
  assert.ok(repairStart >= 0, "Olga repair comment must exist");
  const repairSql = newSql.slice(repairStart);
  assert.doesNotMatch(
    repairSql,
    /RAISE EXCEPTION/,
    "Olga repair is a no-op on mismatch, not a failing RAISE",
  );
  assert.equal((newSql.match(/UPDATE public\.practices/g) ?? []).length, 2);
  assert.match(
    newSql,
    /WHERE id = 'b8f16e12-c301-44f2-bd23-ec1eb387cb3d'/,
  );

  const matching = applyOlgaRepair({
    id: OLGA_ID,
    status: "unpublished",
    moderation_status: "approved",
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
  });
  assert.equal(matching.status, "unpublished");
  assert.equal(matching.moderation_status, "approved");
  assert.equal(matching.is_catalog_listed, true);
  assert.equal(matching.catalog_visibility, "listed");

  const mismatchPublished = applyOlgaRepair({
    id: OLGA_ID,
    status: "published",
    moderation_status: "approved",
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
  });
  assert.equal(mismatchPublished.status, "published");
  assert.equal(mismatchPublished.is_catalog_listed, false);
  assert.equal(mismatchPublished.catalog_visibility, "unlisted");

  const mismatchAlreadyListed = applyOlgaRepair({
    id: OLGA_ID,
    status: "unpublished",
    moderation_status: "approved",
    is_catalog_listed: true,
    catalog_visibility: "listed",
  });
  assert.deepEqual(mismatchAlreadyListed, {
    id: OLGA_ID,
    status: "unpublished",
    moderation_status: "approved",
    is_catalog_listed: true,
    catalog_visibility: "listed",
  });

  const otherProduct = applyOlgaRepair({
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    status: "unpublished",
    moderation_status: "approved",
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
  });
  assert.equal(otherProduct.is_catalog_listed, false);
  assert.equal(otherProduct.catalog_visibility, "unlisted");

  const selectedUsers = applyOlgaRepair({
    id: OLGA_ID,
    status: "unpublished",
    moderation_status: "approved",
    is_catalog_listed: false,
    catalog_visibility: "selected_users",
  });
  assert.equal(selectedUsers.catalog_visibility, "selected_users");
  assert.equal(selectedUsers.is_catalog_listed, false);
}

function testUiRepublishSkipsPatch() {
  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  const start = form.indexOf("async function publishProduct");
  const end = form.indexOf("async function unpublishProduct", start + 1);
  const publishFn = form.slice(start, end);

  assert.match(publishFn, /shouldSaveProductBeforePublish/);
  assert.match(
    publishFn,
    /fetch\(`\/api\/author\/products\/\$\{id\}\/publish`, \{\s*method: "POST",/,
  );
  assert.doesNotMatch(publishFn, /start_practice_editing/);
  assert.doesNotMatch(publishFn, /approve_and_publish_practice/);
  assert.doesNotMatch(publishFn, /submit-for-moderation/);

  assert.equal(
    shouldSaveProductBeforePublish({
      status: "unpublished",
      moderationStatus: "approved",
      canBypassProductModeration: false,
    }),
    false,
  );

  const saveIf = publishFn.indexOf("if (saveBeforePublish)");
  const saveCall = publishFn.indexOf("await saveProduct()");
  const publishFetch = publishFn.indexOf(
    "`/api/author/products/${id}/publish`",
  );
  assert.ok(saveIf >= 0 && saveCall > saveIf && publishFetch > saveCall);

  const unpublishedBlockStart = form.indexOf("{isUnpublished ? (");
  const unpublishedBlockEnd = form.indexOf(
    "{isDraft && canBypassProductModeration ? (",
    unpublishedBlockStart + 1,
  );
  const unpublishedBlock = form.slice(
    unpublishedBlockStart,
    unpublishedBlockEnd,
  );
  assert.match(unpublishedBlock, /Опубликовать снова/);
  assert.match(unpublishedBlock, /void publishProduct\(\)/);
  assert.doesNotMatch(unpublishedBlock, /void saveProduct\(\)/);
}

function testImmutablePatchStill409() {
  const patchRoute = read("src/app/api/author/products/[id]/route.ts");
  assert.match(patchRoute, /assertPracticePublicContentEditableForActor/);

  assert.throws(
    () =>
      assertPracticePublicContentEditable({
        status: "unpublished",
        moderation_status: "approved",
      }),
    (error) =>
      isPracticePublishedImmutableError(error) && error.status === 409,
  );
}

function testPublishRouteStaysOnPublishAudioProduct() {
  const publishTs = read("src/lib/author-products/publish.ts");
  assert.match(publishTs, /"publish_audio_product"/);
  assert.doesNotMatch(publishTs, /approve_and_publish_practice/);

  const publishRoute = read("src/app/api/author/products/[id]/publish/route.ts");
  assert.match(publishRoute, /publishPracticeProduct/);
  assert.doesNotMatch(publishRoute, /approve_and_publish_practice/);
}

function main() {
  testUnpublishSqlPreservesVisibility();
  testUnpublishRepublishVisibilityCycles();
  testOlgaGuardedRepair();
  testUiRepublishSkipsPatch();
  testImmutablePatchStill409();
  testPublishRouteStaysOnPublishAudioProduct();
  console.log("practice-republish-lifecycle-unit: ok");
}

main();
