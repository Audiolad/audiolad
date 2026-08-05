#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const schema = read(
  "supabase/migrations/20260731180000_practice_moderation_mvp_schema.sql",
);
const gates = read(
  "supabase/migrations/20260731181000_practice_moderation_mvp_gates_and_rpcs.sql",
);

// New timestamps after current main tip migration 20260730160000.
assert.match(schema, /Author product moderation MVP — schema/);
assert.match(gates, /Author product moderation MVP — gates and RPCs/);
assert.ok(
  readFileSync(
    path.join(root, "supabase/migrations/20260731180000_practice_moderation_mvp_schema.sql"),
    "utf8",
  ).length > 0,
);
assert.ok(
  readFileSync(
    path.join(
      root,
      "supabase/migrations/20260731181000_practice_moderation_mvp_gates_and_rpcs.sql",
    ),
    "utf8",
  ).length > 0,
);
assert.doesNotMatch(gates, /practice_moderation_email_outbox/);
assert.doesNotMatch(schema, /practice_moderation_email_outbox/);

// Backfill: published → approved; drafts stay not_submitted.
assert.match(
  schema,
  /moderation_status = CASE[\s\S]*published[\s\S]*approved[\s\S]*not_submitted/i,
);

// Publish gate: UI is not enough — API + DB.
const publishRoute = read("src/app/api/author/products/[id]/publish/route.ts");
assert.match(publishRoute, /assertPublishModerationAllowed/);
assert.match(publishRoute, /moderationGate/);

const moderation = read("src/lib/author-products/moderation.ts");
assert.match(moderation, /export async function assertPublishModerationAllowed/);
assert.match(moderation, /moderation_required/);
assert.match(moderation, /can_bypass_product_moderation|getAuthorCanBypassProductModeration/);

assert.match(gates, /moderation_required/);
assert.match(gates, /guard_practices_publication_moderation/);
assert.match(gates, /CREATE OR REPLACE FUNCTION public\.publish_audio_product/);
assert.match(gates, /author_access_allows_paid_products/);
assert.match(gates, /author_access_allows_content_mutations/);
assert.match(gates, /assert_practice_moderation_ready/);

const preserveListed = read(
  "supabase/migrations/20260805194500_preserve_catalog_listed_on_publish.sql",
);
assert.match(preserveListed, /publish-audio-product:v9/);
assert.match(
  preserveListed,
  /COALESCE\(v_practice\.is_catalog_listed, true\)/,
);

// Sale-lock and content-lock contracts remain available on main code.
const saleLock = read("src/lib/author-products/sale-lock.ts");
assert.match(saleLock, /PRODUCT_CONTENT_LOCKED_AFTER_SALE/);
const deleteLock = read("src/lib/author-products/delete-lock.ts");
assert.match(deleteLock, /paid_purchase_exists|PRODUCT_PAID_PURCHASE_DELETE_LOCK/);

// Canonical sales migration on main must still exist untouched by this port.
const canonical = read(
  "supabase/migrations/20260730160000_author_canonical_sales.sql",
);
assert.match(canonical, /author_canonical_sales/);

// Form: ordinary author submit CTA; no direct publish CTA label for drafts.
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /Отправить на модерацию/);
assert.doesNotMatch(form, /Предпросмотр и публикация/);
assert.match(form, /canBypassProductModeration/);

console.log("author-product-moderation-gate-unit: ok");
