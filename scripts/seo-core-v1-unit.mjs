#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/migrations/20261006130000_seo_core_v1.sql"),
  "utf8",
);

assert.match(sql, /CREATE TABLE public\.seo_queries/);
assert.match(sql, /normalized_query.*UNIQUE|normalized_query_unique UNIQUE/s);
assert.match(sql, /normalize_seo_query[\s\S]*translate\(p_query, 'Ёё', 'Ее'\)/);
assert.match(sql, /CREATE TABLE public\.seo_query_reservations/);
assert.match(sql, /WHERE status IN \('active', 'used'\)/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /FOR UPDATE/);
assert.match(sql, /v_active_count >= 5/);
assert.match(sql, /expires_at <= now\(\)/);
assert.match(sql, /product_id IS NULL/);
assert.match(sql, /primary_seo_query_id uuid NULL/);
assert.match(sql, /mark_published_seo_query_used/);
assert.match(sql, /seo_reservation_product_lifecycle_locked/);
assert.match(sql, /seo_reservation_product_not_linkable/);
assert.match(sql, /v_practice\.status <> 'draft'/);
assert.match(sql, /moderation_status NOT IN \('not_submitted', 'changes_requested'\)/);
assert.match(sql, /TG_OP = 'INSERT' AND NEW\.primary_seo_query_id IS NOT NULL/);
assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.practices/);
assert.match(sql, /seo_query_reservations_select_owner_or_staff/);
assert.match(sql, /EXISTS\s+\(SELECT 1 FROM public\.author_members WHERE user_id = auth\.uid\(\) AND role IN \('owner', 'editor'\)\)/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.reserve_seo_query/);
assert.match(sql, /admin_release_seo_query_reservation/);
console.log("seo-core-v1-unit: ok");
