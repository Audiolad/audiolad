#!/usr/bin/env node
/**
 * Stage 1 PR2 database checks for claim_free_practice.
 *
 * IMPORTANT:
 * - Run ONLY after migration 20260715260000_claim_free_practice.sql
 *   is applied to a non-production database.
 * - Default target: audiolad_baseline_test (NOT production postgres).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  bootstrapDataWriteScript,
  assertProjectEnvLocalSafeForFixtures,
} from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/stage1-pr2-library-claim-db.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const TARGET_DB = process.env.AUDIOLAD_TEST_DB ?? "audiolad_baseline_test";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  databaseName: TARGET_DB,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

function loadEnv() {
  assertProjectEnvLocalSafeForFixtures({ envPath: "/var/www/audiolad/.env.local" });
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getSession(env, email) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`session_failed:${email}:${linkError?.message ?? "missing_token"}`);
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session?.access_token) {
    throw new Error(`verify_failed:${email}`);
  }

  return {
    userId: data.session.user.id,
    accessToken: data.session.access_token,
    admin,
    authed: createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    ),
  };
}

async function ensureRpcExists(admin) {
  const { data, error } = await admin.rpc("claim_free_practice", {
    p_practice_slug: "__missing__",
  });

  if (error?.message?.toLowerCase().includes("could not find the function")) {
    throw new Error(
      "claim_free_practice is missing; apply migration 20260715260000_claim_free_practice.sql first",
    );
  }

  assert(error || data, "rpc should be callable");
}

async function findFreeListedPractice(admin) {
  const { data, error } = await admin
    .from("practices")
    .select("id, slug, is_free, status, is_catalog_listed, price")
    .eq("status", "published")
    .eq("is_free", true)
    .eq("is_catalog_listed", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`practice_lookup_failed:${error.message}`);
  }

  assert(data?.slug, "need one published free listed practice in test DB");
  return data;
}

async function findPaidPractice(admin) {
  const { data, error } = await admin
    .from("practices")
    .select("slug")
    .eq("status", "published")
    .eq("is_free", false)
    .gt("price", 0)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`paid_lookup_failed:${error.message}`);
  }

  assert(data?.slug, "need one paid practice in test DB");
  return data;
}

async function main() {
  if (TARGET_DB === "postgres") {
    throw new Error("Refusing to run against production postgres database");
  }

  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "public" },
    },
  );

  console.log(`stage1-pr2-library-claim-db: target=${TARGET_DB}`);
  await ensureRpcExists(admin);

  const buyerEmail = `pr2-claim-${randomUUID()}@audiolad.test`;
  const buyer = await getSession(env, buyerEmail);
  const freePractice = await findFreeListedPractice(admin);
  const paidPractice = await findPaidPractice(admin);

  const directInsert = await buyer.authed.from("user_practices").insert({
    user_id: buyer.userId,
    practice_id: freePractice.id,
    access_source: "free_claim",
  });

  assert(directInsert.error, "authenticated direct insert must be blocked");

  const firstClaim = await buyer.authed.rpc("claim_free_practice", {
    p_practice_slug: freePractice.slug,
  });

  assert(!firstClaim.error, `first claim failed: ${firstClaim.error?.message}`);
  assert(firstClaim.data?.inserted === true, "first claim must insert");
  assert(firstClaim.data?.access_source === "free_claim", "first claim source");
  assert(firstClaim.data?.in_library === true, "first claim in library");

  const secondClaim = await buyer.authed.rpc("claim_free_practice", {
    p_practice_slug: freePractice.slug,
  });

  assert(!secondClaim.error, `second claim failed: ${secondClaim.error?.message}`);
  assert(secondClaim.data?.inserted === false, "second claim must be idempotent");
  assert(
    secondClaim.data?.access_source === "free_claim",
    "second claim keeps free_claim",
  );

  const paidClaim = await buyer.authed.rpc("claim_free_practice", {
    p_practice_slug: paidPractice.slug,
  });

  assert(paidClaim.error, "paid claim must fail");
  assert(
    paidClaim.error.message.toLowerCase().includes("practice_not_free"),
    "paid claim error",
  );

  const missingClaim = await buyer.authed.rpc("claim_free_practice", {
    p_practice_slug: "missing-practice-slug",
  });

  assert(missingClaim.error, "missing slug must fail");
  assert(
    missingClaim.error.message.toLowerCase().includes("practice_not_found"),
    "missing claim error",
  );

  const { data: starterUser } = await admin
    .from("user_practices")
    .select("user_id, practices!inner(slug)")
    .eq("access_source", "starter")
    .limit(1)
    .maybeSingle();

  if (starterUser?.user_id && starterUser.practices?.slug) {
    const { data: linkData } = await admin.auth.admin.getUserById(starterUser.user_id);
    const starterEmail = linkData.user?.email;

    if (starterEmail) {
      const starterSession = await getSession(env, starterEmail);
      const starterClaim = await starterSession.authed.rpc("claim_free_practice", {
        p_practice_slug: starterUser.practices.slug,
      });

      assert(!starterClaim.error, `starter claim failed: ${starterClaim.error?.message}`);
      assert(starterClaim.data?.inserted === false, "starter claim must not insert");
      assert(
        starterClaim.data?.access_source === "starter",
        "starter source must remain starter",
      );
    }
  }

  console.log("stage1-pr2-library-claim-db: PASS");
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
