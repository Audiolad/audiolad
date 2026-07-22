#!/usr/bin/env node
/**
 * Stage 1 PR2 unit checks: library claim API helpers + migration contract.
 * Safe to run without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const PRACTICE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function extractPracticeSlug(body) {
  const value = body.practice_slug;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (!PRACTICE_SLUG_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function mapClaimRpcErrorMessage(message) {
  const normalized = message.toLowerCase();
  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }
  if (normalized.includes("practice_slug_required")) {
    return { status: 400, error: "invalid_request" };
  }
  if (
    normalized.includes("practice_not_found") ||
    normalized.includes("practice_not_published") ||
    normalized.includes("practice_not_listed")
  ) {
    return { status: 404, error: "practice_not_found" };
  }
  if (normalized.includes("practice_not_free")) {
    return { status: 409, error: "practice_not_free" };
  }
  return { status: 500, error: "internal_error" };
}

function isClaimFreePracticeRpcResult(value) {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof value.practice_id === "string" &&
    typeof value.practice_slug === "string" &&
    typeof value.inserted === "boolean" &&
    typeof value.access_source === "string" &&
    typeof value.show_first_save_prompt === "boolean" &&
    value.in_library === true
  );
}

function toClaimLibrarySuccessBody(row) {
  return {
    library: {
      practice_id: row.practice_id,
      practice_slug: row.practice_slug,
      access_source: row.access_source,
      inserted: row.inserted,
      in_library: true,
    },
    retention: {
      show_first_save_prompt: row.inserted && row.show_first_save_prompt,
    },
  };
}

function testSlugExtraction() {
  assert(
    extractPracticeSlug({ practice_slug: "elixir-molodosti" }) ===
      "elixir-molodosti",
    "valid slug",
  );
  assert(extractPracticeSlug({ practice_slug: " Bad " }) === null, "invalid slug chars");
  assert(extractPracticeSlug({ practice_slug: "" }) === null, "empty slug");
  assert(extractPracticeSlug({ practice_slug: 1 }) === null, "non-string slug");
  assert(extractPracticeSlug({}) === null, "missing slug");
}

function testErrorMapping() {
  assert(
    mapClaimRpcErrorMessage("not_authenticated").error === "unauthorized",
    "auth error",
  );
  assert(
    mapClaimRpcErrorMessage("practice_not_found").status === 404,
    "not found",
  );
  assert(
    mapClaimRpcErrorMessage("practice_not_published").error ===
      "practice_not_found",
    "unpublished maps to not found",
  );
  assert(
    mapClaimRpcErrorMessage("practice_not_listed").error ===
      "practice_not_found",
    "unlisted maps to not found",
  );
  assert(
    mapClaimRpcErrorMessage("practice_not_free").error === "practice_not_free",
    "paid product",
  );
  assert(
    mapClaimRpcErrorMessage("unexpected").error === "internal_error",
    "fallback",
  );
}

function testSuccessBody() {
  const row = {
    practice_id: "c3d63131-3ef4-4dbb-8888-0a5085a456b5",
    practice_slug: "elixir-molodosti",
    inserted: false,
    access_source: "starter",
    in_library: true,
    show_first_save_prompt: false,
  };

  assert(isClaimFreePracticeRpcResult(row), "rpc result guard");
  const body = toClaimLibrarySuccessBody(row);
  assert(body.library.access_source === "starter", "preserve existing source");
  assert(body.library.in_library === true, "in library flag");
  assert(body.retention.show_first_save_prompt === false, "no retention on repeat");
}

function testMigrationFile() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260715260000_claim_free_practice.sql",
    "utf8",
  );

  assert(sql.includes("CREATE FUNCTION public.claim_free_practice"), "rpc created");
  assert(sql.includes("SECURITY DEFINER"), "security definer");
  assert(sql.includes("auth.uid()"), "uses auth uid");
  assert(sql.includes("'free_claim'"), "writes free_claim");
  assert(sql.includes("ON CONFLICT (user_id, practice_id) DO NOTHING"), "idempotent");
  assert(!sql.includes("ON CONFLICT") || !sql.includes("DO UPDATE"), "no downgrade update");
  assert(sql.includes("practice_not_free"), "paid guard");
  assert(sql.includes("is_catalog_listed IS NOT TRUE"), "listed guard");
  assert(sql.includes("GRANT EXECUTE") && sql.includes("authenticated"), "grant authenticated");
  assert(sql.includes("REVOKE ALL") && sql.includes("anon"), "revoke anon");
}

function testSourceFiles() {
  const route = readFileSync(
    "/var/www/audiolad/src/app/api/library/claim/route.ts",
    "utf8",
  );
  const helpers = readFileSync(
    "/var/www/audiolad/src/lib/library/claim-api.ts",
    "utf8",
  );

  assert(route.includes('claim_free_practice'), "route calls rpc");
  assert(route.includes("createClientFromRequest"), "session from request");
  assert(route.includes("data.inserted ? 201 : 200"), "idempotent status codes");
  assert(helpers.includes("extractPracticeSlug"), "reuses order slug helper");
}

function main() {
  testSlugExtraction();
  testErrorMapping();
  testSuccessBody();
  testMigrationFile();
  testSourceFiles();
  console.log("stage1-pr2-library-claim-unit: PASS");
}

main();
