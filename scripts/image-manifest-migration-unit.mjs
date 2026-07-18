#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testMigrationContract() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260718120000_image_variant_manifests.sql",
    "utf8",
  );

  assert(sql.includes("cover_image"), "practices.cover_image column");
  assert(sql.includes("avatar_image"), "authors/users avatar_image columns");
  assert(sql.includes("banner_image"), "authors.banner_image column");
  assert(sql.includes("jsonb"), "manifest columns use jsonb");
  assert(!sql.includes("default '{}'"), "manifest columns must not default to {}");
  assert(!sql.toLowerCase().includes("backfill"), "migration must not include heavy backfill");
  assert(!sql.toLowerCase().includes("drop column cover_url"), "legacy cover_url must remain");
}

function main() {
  testMigrationContract();
  console.log("image-manifest-migration-unit: all checks passed");
}

main();
