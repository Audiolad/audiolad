#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const migration = read(
  "supabase/migrations/20261019120000_author_slug_redirects_and_space_ops.sql",
);
const spaceOps = read("src/lib/authors/space-ops.ts");
const authorApi = read("src/app/api/author/space/route.ts");
const authorPage = read(
  "src/app/(platform)/(listener)/authors/[slug]/page.tsx",
);
const practicePage = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);
const listenPage = read(
  "src/app/(platform)/listen/[...segments]/page.tsx",
);
const ownerUi = read(
  "src/components/author-dashboard/AuthorSpaceUrlSettings.tsx",
);
const adminActions = read(
  "src/app/(platform)/admin/authors/slug/actions.ts",
);

function main() {
  // A. History table stores old_slug -> author_id
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.author_slug_redirects/);
  assert.match(migration, /old_slug text PRIMARY KEY/);
  assert.match(migration, /author_id uuid NOT NULL/);

  // B. Namespace: current slug cannot collide with another author's history
  assert.match(migration, /enforce_author_slug_namespace|author_slug_redirects_author_id/);
  assert.match(migration, /r\.old_slug = NEW\.slug/);
  assert.match(migration, /r\.author_id IS DISTINCT FROM NEW\.id/);

  // C. allocate_unique_author_slug skips history
  assert.match(migration, /allocate_unique_author_slug/);
  assert.match(
    migration,
    /FROM public\.author_slug_redirects AS r WHERE r\.old_slug = v_candidate/,
  );

  // D. Owner rename locked by published / finance; admin bypass
  assert.match(migration, /can_change_author_slug/);
  assert.match(migration, /slug_change_locked_published/);
  assert.match(migration, /slug_change_locked_finance/);
  assert.match(migration, /has_platform_permission\(v_uid, 'authors\.manage'\)/);

  // E. change_author_slug writes history and supports reclaim of own old slug
  assert.match(migration, /change_author_slug/);
  assert.match(migration, /INSERT INTO public\.author_slug_redirects/);
  assert.match(migration, /DELETE FROM public\.author_slug_redirects AS r/);

  // F. resolve returns current slug from authors
  assert.match(migration, /resolve_author_slug_redirect/);
  assert.match(migration, /'current_slug', v_current/);

  // G. delete empty space blocked by practices/finance/etc
  assert.match(migration, /delete_empty_author_space/);
  assert.match(migration, /author_space_delete_blockers/);
  assert.match(migration, /has_practices/);
  assert.match(migration, /has_finance/);

  // H. create_author_project rejects historical slugs
  assert.match(
    migration,
    /OR EXISTS \(SELECT 1 FROM public\.author_slug_redirects AS r WHERE r\.old_slug = v_slug\)/,
  );

  // I. Public pages permanentRedirect / 308 path helpers
  assert.match(authorPage, /permanentRedirect/);
  assert.match(authorPage, /resolveAuthorSlugRedirect/);
  assert.match(practicePage, /resolveAuthorSlugRedirect|buildPracticeRedirectTarget/);
  assert.match(listenPage, /resolveAuthorSlugRedirect|buildListenRedirectTarget/);
  assert.match(spaceOps, /buildAuthorRedirectTarget/);
  assert.match(spaceOps, /buildPracticeRedirectTarget/);
  assert.match(spaceOps, /buildListenRedirectTarget/);

  // J. Owner API + UI wired
  assert.match(authorApi, /export async function PATCH/);
  assert.match(authorApi, /export async function DELETE/);
  assert.match(authorApi, /changeAuthorSlug/);
  assert.match(authorApi, /deleteEmptyAuthorSpace/);
  assert.match(ownerUi, /\/api\/author\/space/);
  assert.match(ownerUi, /can_change_slug/);
  assert.match(ownerUi, /can_delete/);

  // K. Admin rename path uses authors.manage
  assert.match(adminActions, /authors\.manage/);
  assert.match(adminActions, /changeAuthorSlug/);

  // L. IndexNow on rename
  assert.match(authorApi, /scheduleIndexNowNotification/);
  assert.match(authorApi, /author_profile_updated/);

  // M. Cookie clear on delete / set on rename
  assert.match(authorApi, /buildAuthorProjectCookie|buildClearedAuthorProjectCookie/);


  // N. History table is not publicly selectable; resolve RPC is the public path
  assert.match(migration, /REVOKE ALL ON TABLE public\.author_slug_redirects FROM anon, authenticated/);
  assert.doesNotMatch(
    migration,
    /GRANT SELECT ON TABLE public\.author_slug_redirects TO (anon|authenticated)/,
  );
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.resolve_author_slug_redirect/);

  // O. Shared transactional namespace lock on rename + create
  assert.match(migration, /acquire_author_slug_namespace_lock/);
  assert.match(migration, /PERFORM public\.acquire_author_slug_namespace_lock\(v_new_slug\)/);
  assert.match(migration, /PERFORM public\.acquire_author_slug_namespace_lock\(v_slug\)/);

  // P. Redirect helpers preserve query string (listen autoplay/access)
  assert.match(spaceOps, /export function appendQueryString/);
  assert.match(spaceOps, /buildListenRedirectTarget\([\s\S]*searchParams/);
  assert.match(listenPage, /buildListenRedirectTarget\([\s\S]*query/);
  assert.match(authorPage, /buildAuthorRedirectTarget\([\s\S]*query/);
  assert.match(practicePage, /buildPracticeRedirectTarget\([\s\S]*searchParams/);

  // Q. Admin preview → confirm UX
  assert.match(adminActions, /previewAuthorSlugChangeAsAdmin/);
  assert.match(adminActions, /confirmAuthorSlugChangeAsAdmin/);
  assert.match(adminActions, /author_lookup/);

  console.log("author-space-slug-ops-unit: ok");
}

main();
