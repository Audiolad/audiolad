#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260823183000_price_promotion_oneshot_bind.sql",
);

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function main() {
  const sql = readFileSync(MIGRATION, "utf8");
  assert(sql.includes("ON CONFLICT (promotion_id, visitor_id) DO NOTHING"), "conflict");
  assert(!sql.includes("started_at = v_now"), "no restart");
  assert(sql.includes("bind_practice_price_promotion_starts"), "bind");

  if (!dockerAvailable()) {
    console.log("price-promotions-sql-unit: skipped (no Docker)");
    return;
  }

  console.log(
    "price-promotions-sql-unit: Docker is present, but isolated DB apply is not wired; contract checks ok",
  );
}

main();
