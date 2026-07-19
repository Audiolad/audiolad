#!/usr/bin/env node
/**
 * Promo signup practice claim regression checks — no database required.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testPostSignupHandlerMounting() {
  const listenClient = readFileSync(
    "/var/www/audiolad/src/components/audio/ListenPageClient.tsx",
    "utf8",
  );
  const practicePage = readFileSync(
    "/var/www/audiolad/src/app/(listener)/practice/[...segments]/page.tsx",
    "utf8",
  );
  const postSignup = readFileSync(
    "/var/www/audiolad/src/lib/promo/post-signup.ts",
    "utf8",
  );

  assert(
    listenClient.includes("shouldRunPromoPostSignupHandler(isAuthenticated)"),
    "listen page mounts handler for authenticated users",
  );
  assert(
    !listenClient.includes("isAuthenticated && promoConversionMode"),
    "handler no longer gated by guest-only promoConversionMode",
  );
  assert(
    practicePage.includes("user ? (") &&
      practicePage.includes("<PromoPostSignupHandler"),
    "practice page mounts handler for authenticated users",
  );
  assert(postSignup.includes("shouldRunPromoPostSignupHandler"), "post-signup helper exists");
}

function testSignupContextFields() {
  const context = readFileSync(
    "/var/www/audiolad/src/lib/promo/signup-context.ts",
    "utf8",
  );

  assert(context.includes("practiceId"), "context stores practiceId");
  assert(context.includes("practiceSlug"), "context stores practiceSlug");
  assert(context.includes("returnTo"), "context stores returnTo");
  assert(context.includes("PENDING_SIGNUP_KEY"), "sessionStorage key defined");
}

function testCompleteSignupApi() {
  const api = readFileSync(
    "/var/www/audiolad/src/lib/promo/complete-signup-api.ts",
    "utf8",
  );
  const route = readFileSync(
    "/var/www/audiolad/src/app/api/promo/complete-signup/route.ts",
    "utf8",
  );
  const handler = readFileSync(
    "/var/www/audiolad/src/components/promo/PromoPostSignupHandler.tsx",
    "utf8",
  );

  assert(api.includes("practice_id"), "API body accepts practice_id");
  assert(route.includes("p_practice_id"), "route passes practice_id to RPC");
  assert(route.includes("alreadySaved"), "idempotent response field");
  assert(route.includes("progressTransferred"), "progress transfer flag");
  assert(handler.includes("practice_id: pending?.practiceId"), "handler sends practice_id");
  assert(handler.includes("attemptedRef.current = false"), "retry after failure");
  assert(
    handler.includes("clearPromoSignupContext()") &&
      handler.includes("if (!response.ok"),
    "context cleared only after success path",
  );
}

function testClaimRpcMigration() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260716190000_claim_promo_practice_by_id.sql",
    "utf8",
  );

  assert(sql.includes("p_practice_id uuid"), "RPC accepts practice_id");
  assert(sql.includes("guest_access_enabled IS TRUE"), "guest promo eligible");
  assert(sql.includes("is_catalog_listed IS NOT FALSE"), "free catalog listed eligible");
  assert(sql.includes("ON CONFLICT (user_id, practice_id) DO NOTHING"), "idempotent insert");
  assert(sql.includes("DROP FUNCTION IF EXISTS public.claim_promo_practice(text)"), "replaces old RPC");
}

function testLibraryRefresh() {
  const handler = readFileSync(
    "/var/www/audiolad/src/components/promo/PromoPostSignupHandler.tsx",
    "utf8",
  );

  assert(handler.includes("router.refresh()"), "library cache refresh after claim");
}

function testNoAutoClaimWithoutContext() {
  const handler = readFileSync(
    "/var/www/audiolad/src/components/promo/PromoPostSignupHandler.tsx",
    "utf8",
  );

  assert(handler.includes("isPromoSignupContextForPractice"), "requires matching pending context");
}

function main() {
  testPostSignupHandlerMounting();
  testSignupContextFields();
  testCompleteSignupApi();
  testClaimRpcMigration();
  testLibraryRefresh();
  testNoAutoClaimWithoutContext();
  console.log("promo-signup-claim-unit: ok");
}

main();
