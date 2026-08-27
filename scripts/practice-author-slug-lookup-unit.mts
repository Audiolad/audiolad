import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPracticeByAuthorAndSlug } from "../src/lib/products/lookup";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const SHARED_SLUG =
  "25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditatsiy";

const AUTHOR_A = {
  id: "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c",
  name: "Sergey Petrov",
  slug: "sergey-petrov",
  description: null,
  avatar_url: null,
  author_type: "person",
  avatar_image: null,
};

const AUTHOR_B = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  name: "Aurafon",
  slug: "aurafon",
  description: null,
  avatar_url: null,
  author_type: "person",
  avatar_image: null,
};

const PRACTICE_A = {
  id: "a4135654-c565-41da-abe5-9ef7d281aa9f",
  author_id: AUTHOR_A.id,
  title: "25 готовых решений A",
  slug: SHARED_SLUG,
  cover_image: null,
  status: "draft",
  authors: AUTHOR_A,
};

const PRACTICE_B = {
  id: "f40ff08e-dd94-4500-a0d5-ef416ebc7b10",
  author_id: AUTHOR_B.id,
  title: "25 готовых решений B",
  slug: SHARED_SLUG,
  cover_image: null,
  status: "draft",
  authors: AUTHOR_B,
};

type Filter = { column: string; value: unknown };

function createLookupClient() {
  const authors = [AUTHOR_A, AUTHOR_B];
  const practices = [PRACTICE_A, PRACTICE_B];

  const from = (table: string) => {
    const filters: Filter[] = [];

    const query = {
      select(..._args: unknown[]) {
        void _args;
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return query;
      },
      async maybeSingle() {
        if (table === "authors") {
          const slug = filters.find((filter) => filter.column === "slug")?.value;
          const matches = authors.filter((author) => author.slug === slug);

          if (matches.length > 1) {
            return {
              data: null,
              error: {
                code: "PGRST116",
                message:
                  "JSON object requested, multiple (or no) rows returned",
              },
            };
          }

          return { data: matches[0] ?? null, error: null };
        }

        if (table === "practices") {
          const slug = filters.find((filter) => filter.column === "slug")?.value;
          const authorId = filters.find(
            (filter) => filter.column === "author_id",
          )?.value;
          const embedAuthorSlug = filters.find(
            (filter) => filter.column === "authors.slug",
          )?.value;

          let matches = practices.filter((practice) => practice.slug === slug);

          if (authorId) {
            matches = matches.filter(
              (practice) => practice.author_id === authorId,
            );
          }

          // PostgREST: a nested `.eq("authors.slug", …)` without `!inner`
          // filters the embed, not the parent practices rows.
          void embedAuthorSlug;

          if (matches.length > 1) {
            return {
              data: null,
              error: {
                code: "PGRST116",
                message:
                  "JSON object requested, multiple (or no) rows returned",
              },
            };
          }

          return { data: matches[0] ?? null, error: null };
        }

        return {
          data: null,
          error: { message: `unexpected table ${table}` },
        };
      },
    };

    return query;
  };

  return { from };
}

function asClient(client: ReturnType<typeof createLookupClient>) {
  return client as unknown as SupabaseClient;
}

async function testDuplicateSlugResolvesByAuthor() {
  const supabase = asClient(createLookupClient());

  const authorA = await getPracticeByAuthorAndSlug(
    supabase,
    AUTHOR_A.slug,
    SHARED_SLUG,
  );
  const authorB = await getPracticeByAuthorAndSlug(
    supabase,
    AUTHOR_B.slug,
    SHARED_SLUG,
  );

  assert.equal(authorA.error, false);
  assert.equal(authorB.error, false);
  assert.equal(authorA.practice?.id, PRACTICE_A.id);
  assert.equal(authorB.practice?.id, PRACTICE_B.id);
  assert.equal(authorA.practice?.author_id, AUTHOR_A.id);
  assert.equal(authorB.practice?.author_id, AUTHOR_B.id);
}

async function testUnknownAuthorIsNotFoundNotError() {
  const supabase = asClient(createLookupClient());
  const result = await getPracticeByAuthorAndSlug(
    supabase,
    "missing-author",
    SHARED_SLUG,
  );

  assert.equal(result.error, false);
  assert.equal(result.practice, null);
}

async function testUnknownProductIsNotFoundNotError() {
  const supabase = asClient(createLookupClient());
  const result = await getPracticeByAuthorAndSlug(
    supabase,
    AUTHOR_A.slug,
    "other-product-slug",
  );

  assert.equal(result.error, false);
  assert.equal(result.practice, null);
}

async function testEmbedFilterWithoutInnerWouldFail() {
  const supabase = createLookupClient();
  const { data, error } = await supabase
    .from("practices")
    .select("*")
    .eq("slug", SHARED_SLUG)
    .eq("authors.slug", AUTHOR_A.slug)
    .maybeSingle();

  assert.equal(data, null);
  assert.equal(error?.code, "PGRST116");
}

function testResolverUsesAuthorIdNotEmbedFilter() {
  const lookup = read("src/lib/products/lookup.ts");
  const functionBody = lookup.slice(
    lookup.indexOf("export async function getPracticeByAuthorAndSlug"),
    lookup.indexOf("export async function resolveLegacyPracticePath"),
  );

  assert.match(functionBody, /getAuthorBySlug/);
  assert.match(functionBody, /\.eq\("author_id", author\.id\)/);
  assert.match(functionBody, /\.eq\("slug", productSlug\)/);
  assert.doesNotMatch(functionBody, /\.eq\("authors\.slug"/);
  assert.doesNotMatch(functionBody, /authors!inner/);
}

function testCheckoutAndClaimPreferPracticeId() {
  const orderRoute = read("src/app/api/orders/route.ts");
  const pendingRoute = read("src/app/api/orders/pending/route.ts");
  const claimRoute = read("src/app/api/library/claim/route.ts");
  const buyButton = read("src/components/BuyPracticeButton.tsx");
  const membership = read("src/lib/library/use-library-membership.ts");
  const checkoutStatus = read("src/app/api/checkout/status/route.ts");
  const migration = read(
    "supabase/migrations/20260830120000_practice_rpc_resolve_by_id.sql",
  );

  assert.match(orderRoute, /p_practice_id: practiceId/);
  assert.match(pendingRoute, /requestedPracticeId/);
  assert.match(pendingRoute, /\.eq\("id", requestedPracticeId\)/);
  assert.match(claimRoute, /p_practice_id: practiceId/);
  assert.match(buyButton, /practice_id: practiceId/);
  assert.match(membership, /practice_id: practiceId/);
  assert.match(checkoutStatus, /orderPracticeId/);
  assert.match(checkoutStatus, /\.eq\("id", orderPracticeId\)/);

  assert.match(migration, /p_practice_id uuid DEFAULT NULL/);
  assert.match(migration, /WHERE p\.id = p_practice_id/);
  assert.match(
    migration,
    /CREATE FUNCTION public\.create_practice_order\([\s\S]*p_practice_id uuid DEFAULT NULL/,
  );
  assert.match(
    migration,
    /CREATE FUNCTION public\.claim_free_practice\([\s\S]*p_practice_id uuid DEFAULT NULL/,
  );
}

function testPublicAndPreviewShareResolver() {
  const practicePage = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const listenPage = read("src/lib/listen/page-shared.tsx");
  const listenSession = read("src/lib/listen/load-session-payload.ts");
  const listenApi = read("src/lib/listen/api-context.ts");
  const catalogPlayback = read("src/lib/catalog/catalog-playback.ts");

  assert.match(practicePage, /getPracticeByAuthorAndSlug/);
  assert.match(practicePage, /canActivatePublishPreviewMode/);
  assert.match(practicePage, /canActivatePublishListenerViewMode/);
  assert.doesNotMatch(practicePage, /\.eq\("authors\.slug"/);
  assert.doesNotMatch(practicePage, /\.from\("practices"\)/);

  assert.match(listenPage, /getPracticeByAuthorAndSlug/);
  assert.doesNotMatch(listenPage, /\.eq\("authors\.slug"/);
  assert.doesNotMatch(listenPage, /\.from\("practices"\)/);

  assert.match(listenSession, /getPracticeByAuthorAndSlug/);
  assert.doesNotMatch(listenSession, /\.eq\("authors\.slug"/);
  assert.doesNotMatch(listenSession, /\.from\("practices"\)/);

  assert.match(listenApi, /getPracticeByAuthorAndSlug/);
  assert.match(catalogPlayback, /getPracticeByAuthorAndSlug/);
}

await testDuplicateSlugResolvesByAuthor();
await testUnknownAuthorIsNotFoundNotError();
await testUnknownProductIsNotFoundNotError();
await testEmbedFilterWithoutInnerWouldFail();
testResolverUsesAuthorIdNotEmbedFilter();
testPublicAndPreviewShareResolver();
testCheckoutAndClaimPreferPracticeId();

console.log("practice-author-slug-lookup-unit: ok");
