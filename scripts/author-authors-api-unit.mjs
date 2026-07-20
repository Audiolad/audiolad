#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const authModule = readFileSync(
    path.join(ROOT, "src/lib/author-products/auth.ts"),
    "utf8",
  );
  const route = readFileSync(
    path.join(ROOT, "src/app/api/author/authors/route.ts"),
    "utf8",
  );
  const promotionAccess = readFileSync(
    path.join(ROOT, "src/lib/promotion/access.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260714180000_unified_audio_product_foundation.sql",
    ),
    "utf8",
  );

  assert(
    authModule.includes("supabaseClient?: SupabaseClient"),
    "listAuthorWorkspacesForUser accepts scoped client",
  );
  assert(
    authModule.includes("supabaseClient ?? (await createClient())"),
    "listAuthorWorkspacesForUser falls back to cookie client",
  );
  assert(
    route.includes("listAuthorWorkspacesForUser(user.id, supabase)"),
    "authors route reuses authenticated supabase client",
  );
  assert(
    promotionAccess.includes("listAuthorWorkspacesForUser(userId, supabase)"),
    "promotion workspaces reuse authenticated supabase client",
  );
  assert(
    migration.includes("REVOKE ALL ON TABLE public.author_members FROM anon"),
    "anon has no direct author_members access",
  );
  assert(
    migration.includes("GRANT SELECT ON TABLE public.author_members TO authenticated"),
    "authenticated has SELECT grant",
  );
  assert(
    migration.includes("user_id = auth.uid()"),
    "RLS restricts memberships to current user",
  );
  assert(
    !route.includes("searchParams") && !route.includes("request.json"),
    "authors route does not accept client-supplied user id",
  );

  console.log("author-authors-api-unit: ok");
}

main();
