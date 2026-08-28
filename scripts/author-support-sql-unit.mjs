#!/usr/bin/env node
/**
 * Parse-only contract checks: support-mode SQL must not downgrade current-main
 * (#138 visibility / publish v10 / actor-bypass v1).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const support = readFileSync(
  join(root, "supabase/migrations/20260901130000_author_support_mode.sql"),
  "utf8",
);
const visibility = readFileSync(
  join(root, "supabase/migrations/20260901120100_practice_catalog_visibility_modes.sql"),
  "utf8",
);
const actorBypass = readFileSync(
  join(root, "supabase/migrations/20260819120000_actor_bypass_product_moderation.sql"),
  "utf8",
);

assert.match(visibility, /ADD COLUMN IF NOT EXISTS catalog_visibility text/);
assert.match(visibility, /selected_users/);
assert.match(visibility, /CREATE OR REPLACE FUNCTION public\.sync_practice_catalog_visibility/);
assert.doesNotMatch(
  support,
  /CREATE OR REPLACE FUNCTION public\.sync_practice_catalog_visibility/,
);
assert.doesNotMatch(support, /DROP FUNCTION IF EXISTS public\.sync_practice_catalog_visibility/);
assert.doesNotMatch(support, /DROP TABLE .*practice_visibility_users/);

assert.match(actorBypass, /audiolad:actor-bypass-product-moderation:v1/);
assert.match(actorBypass, /audiolad:publish-audio-product:v10/);
assert.match(support, /audiolad:actor-bypass-product-moderation:v1/);
assert.match(support, /audiolad:publish-audio-product:v10/);
assert.match(support, /preserves is_catalog_listed/);
assert.match(support, /COALESCE\(v_practice\.is_catalog_listed, true\)/);
assert.doesNotMatch(
  support,
  /UPDATE public\.practices SET status='published',is_catalog_listed=true/,
);

assert.match(support, /author_support_request_token_hash/);
assert.match(support, /s\.token_hash = v_proof/);
assert.match(support, /IF v_proof IS NULL THEN\s+RETURN false/s);
assert.match(support, /record_author_support_mutation_audit/);
assert.match(support, /author_support_audit_failed/);
assert.match(support, /with_support_proof/);
assert.match(support, /pg_advisory_xact_lock/);
assert.match(support, /FROM auth\.users AS au/);
assert.match(support, /Product is not published\./);
assert.match(
  support,
  /Editing mode requires published\/unpublished approved \(or published bypass\)\./,
);

console.log("author-support-sql-unit: ok");
