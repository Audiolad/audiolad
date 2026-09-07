#!/usr/bin/env node
/**
 * Duplicate product slugs across authors must not collapse /listen into
 * «Не удалось загрузить практику». DB uniqueness is (author_id, slug) only.
 * renderListenPage must inner-join authors, same as getPracticeByAuthorAndSlug.
 *
 * For audio_post, a successful (author, slug) lookup must redirect to
 * /practice/{authorSlug}/{productSlug} — not the load-error UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isAudioPostProductKind } from "../src/lib/author-products/product-kind";
import { shouldBlockPublicPracticeAccess } from "../src/lib/fixtures/test-fixture-marker";
import { buildAudioPostListenRedirectPath } from "../src/lib/listen/playback-navigation";
import {
  getPracticeAuthorSlug,
  type PublicPracticeRow,
} from "../src/lib/products/lookup";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED_SLUG = "kody-zhenskoy-prityagatelnosti";
const UNIQUE_SLUG = "meditatsiya-na-privlechenie-lyubvi";
const LOAD_ERROR_TITLE = "Не удалось загрузить практику";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

type CollisionAuthor = {
  id: string;
  name: string;
  slug: string;
};

type CollisionPractice = {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  audio_url: string | null;
  cover_url: string | null;
  cover_image: unknown;
  use_shared_cover: boolean;
  updated_at: string;
  status: string;
  is_free: boolean;
  is_catalog_listed: boolean;
  catalog_visibility: string;
  guest_access_enabled: boolean;
  product_kind: string;
  publication_class: string;
  listening_notice_enabled: boolean;
  listening_notice_title: string | null;
  listening_notice_text: string | null;
  authors: CollisionAuthor;
};

const authorAShared: CollisionPractice = {
  id: "practice-sergey-and-zoya-shared",
  author_id: "author-sergey-and-zoya",
  title: "Коды женской притягательности (A)",
  slug: SHARED_SLUG,
  description: "Author A audio_post",
  format: "Аудиопост",
  duration_minutes: 12,
  audio_url: null,
  cover_url: null,
  cover_image: null,
  use_shared_cover: true,
  updated_at: "2026-09-01T00:00:00.000Z",
  status: "published",
  is_free: true,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  guest_access_enabled: false,
  product_kind: "audio_post",
  publication_class: "practice",
  listening_notice_enabled: false,
  listening_notice_title: null,
  listening_notice_text: null,
  authors: {
    id: "author-sergey-and-zoya",
    name: "Сергей и Зоя",
    slug: "sergey-and-zoya",
  },
};

const authorBShared: CollisionPractice = {
  id: "practice-zoya-petrova-shared",
  author_id: "author-zoya-petrova",
  title: "Коды женской притягательности (B)",
  slug: SHARED_SLUG,
  description: "Author B audio_post",
  format: "Аудиопост",
  duration_minutes: 14,
  audio_url: null,
  cover_url: null,
  cover_image: null,
  use_shared_cover: true,
  updated_at: "2026-09-01T00:00:00.000Z",
  status: "published",
  is_free: true,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  guest_access_enabled: false,
  product_kind: "audio_post",
  publication_class: "practice",
  listening_notice_enabled: false,
  listening_notice_title: null,
  listening_notice_text: null,
  authors: {
    id: "author-zoya-petrova",
    name: "Зоя Петрова",
    slug: "zoya-petrova",
  },
};

const authorAUnique: CollisionPractice = {
  id: "practice-sergey-and-zoya-unique",
  author_id: "author-sergey-and-zoya",
  title: "Медитация на привлечение любви",
  slug: UNIQUE_SLUG,
  description: "Unique-slug audio_post control",
  format: "Аудиопост",
  duration_minutes: 18,
  audio_url: null,
  cover_url: null,
  cover_image: null,
  use_shared_cover: true,
  updated_at: "2026-09-01T00:00:00.000Z",
  status: "published",
  is_free: true,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  guest_access_enabled: false,
  product_kind: "audio_post",
  publication_class: "practice",
  listening_notice_enabled: false,
  listening_notice_title: null,
  listening_notice_text: null,
  authors: {
    id: "author-sergey-and-zoya",
    name: "Сергей и Зоя",
    slug: "sergey-and-zoya",
  },
};

function usesInnerAuthorJoin(selectSql: string): boolean {
  return selectSql.includes("authors!practices_author_id_fkey!inner");
}

/**
 * PostgREST: filtering `authors.slug` without `!inner` only filters the
 * embed. Parent rows that share the product slug still all match, so
 * maybeSingle() errors (PGRST116) and /listen shows the load-error UI.
 * `!inner` applies the author filter to the parent row set.
 */
function createCollisionSupabase() {
  const practices = [authorAShared, authorBShared, authorAUnique];

  return {
    from(table: string) {
      let selectSql = "";
      const filters = new Map<string, unknown>();

      const resolvePractices = () => {
        const productSlug = filters.get("slug");
        const authorSlug = filters.get("authors.slug");
        let rows = practices.filter((practice) => practice.slug === productSlug);

        if (usesInnerAuthorJoin(selectSql) && typeof authorSlug === "string") {
          rows = rows.filter((practice) => practice.authors.slug === authorSlug);
        }

        return rows;
      };

      const chain = {
        select(sql: string) {
          selectSql = sql;
          return chain;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return chain;
        },
        maybeSingle() {
          if (table !== "practices") {
            return Promise.resolve({ data: null, error: null });
          }

          const rows = resolvePractices();

          if (rows.length > 1) {
            return Promise.resolve({
              data: null,
              error: {
                code: "PGRST116",
                message: "JSON object requested, multiple (or no) rows returned",
              },
            });
          }

          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
      };

      return chain;
    },
  };
}

function extractRenderListenPagePracticeSelect(source: string): string {
  const fnStart = source.indexOf("export async function renderListenPage");
  assert.notEqual(fnStart, -1, "renderListenPage must exist");

  const fromPractices = source.indexOf('.from("practices")', fnStart);
  assert.notEqual(fromPractices, -1, "renderListenPage must query practices");

  const selectStart = source.indexOf(".select(", fromPractices);
  assert.notEqual(selectStart, -1, "renderListenPage must select practice fields");

  const tickStart = source.indexOf("`", selectStart);
  const tickEnd = source.indexOf("`", tickStart + 1);
  assert.ok(tickStart > 0 && tickEnd > tickStart, "practice select must be a template string");

  return source.slice(tickStart + 1, tickEnd);
}

type ListenPageLookupResult =
  | { kind: "load_error"; title: string }
  | { kind: "not_found" }
  | { kind: "redirect"; href: string; practiceId: string }
  | { kind: "listen"; practiceId: string };

/**
 * Post-lookup branch of renderListenPage: practiceError → load-error UI;
 * audio_post → /practice/{author}/{slug}. Mirrors production order so a
 * colliding slug cannot skip past maybeSingle() into the error screen.
 */
function resolveListenPageAfterLookup(
  practice: CollisionPractice | null,
  practiceError: { code?: string } | null,
  authorSlug: string,
): ListenPageLookupResult {
  if (practiceError) {
    return { kind: "load_error", title: LOAD_ERROR_TITLE };
  }

  if (!practice || shouldBlockPublicPracticeAccess(practice)) {
    return { kind: "not_found" };
  }

  const resolvedAuthorSlug =
    getPracticeAuthorSlug(practice as PublicPracticeRow) ?? authorSlug;

  if (isAudioPostProductKind(practice.product_kind)) {
    return {
      kind: "redirect",
      href: buildAudioPostListenRedirectPath(resolvedAuthorSlug, practice.slug),
      practiceId: practice.id,
    };
  }

  return { kind: "listen", practiceId: practice.id };
}

async function lookupListenPagePractice(
  selectSql: string,
  authorSlug: string,
  productSlug: string,
) {
  return createCollisionSupabase()
    .from("practices")
    .select(selectSql)
    .eq("slug", productSlug)
    .eq("authors.slug", authorSlug)
    .maybeSingle();
}

async function loadListenPage(
  selectSql: string,
  authorSlug: string,
  productSlug: string,
): Promise<ListenPageLookupResult> {
  const { data, error } = await lookupListenPagePractice(
    selectSql,
    authorSlug,
    productSlug,
  );

  return resolveListenPageAfterLookup(
    data as CollisionPractice | null,
    error,
    authorSlug,
  );
}

function testSourceUsesInnerAuthorJoin() {
  const pageShared = read("src/lib/listen/page-shared.tsx");
  const lookup = read("src/lib/products/lookup.ts");
  const sessionLoad = read("src/lib/listen/load-session-payload.ts");
  const selectSql = extractRenderListenPagePracticeSelect(pageShared);

  assert.match(
    selectSql,
    /authors!practices_author_id_fkey!inner/,
    "listen page lookup must inner-join authors so maybeSingle is unique",
  );
  assert.match(
    pageShared,
    /authors!practices_author_id_fkey!inner/,
    "renderListenPage source must keep the inner author join",
  );
  assert.match(
    lookup,
    /authors!practices_author_id_fkey!inner/,
    "product lookup remains the working inner-join reference",
  );
  assert.match(
    sessionLoad,
    /authors!practices_author_id_fkey!inner/,
    "session loader inner join from #373 must stay in place",
  );
  assert.match(
    pageShared,
    /if \(practiceError\) \{[\s\S]*Не удалось загрузить практику/,
    "PGRST116 / maybeSingle error still maps to the load-error UI",
  );
  assert.match(
    pageShared,
    /if \(isAudioPostProductKind\(practiceRow\.product_kind\)\) \{[\s\S]*redirect\(\s*buildAudioPostListenRedirectPath/,
    "audio_post must redirect to the public practice path after a unique lookup",
  );
}

async function testCollisionWithoutInnerJoinShowsLoadError() {
  const brokenSelect = `
      id, slug, product_kind,
      authors!practices_author_id_fkey (id, name, slug)
    `;

  const result = await loadListenPage(
    brokenSelect,
    "sergey-and-zoya",
    SHARED_SLUG,
  );

  assert.equal(result.kind, "load_error");
  if (result.kind !== "load_error") {
    return;
  }

  assert.equal(result.title, LOAD_ERROR_TITLE);
  assert.notEqual(result.kind, "redirect");
}

async function testAuthorASharedSlugSelectsPracticeA() {
  const pageShared = read("src/lib/listen/page-shared.tsx");
  const selectSql = extractRenderListenPagePracticeSelect(pageShared);
  const result = await loadListenPage(
    selectSql,
    "sergey-and-zoya",
    SHARED_SLUG,
  );

  assert.equal(result.kind, "redirect", "author A audio_post must redirect, not show load-error UI");
  if (result.kind !== "redirect") {
    return;
  }

  assert.equal(result.practiceId, authorAShared.id);
  assert.notEqual(result.practiceId, authorBShared.id);
  assert.equal(
    result.href,
    `/practice/sergey-and-zoya/${SHARED_SLUG}`,
  );
  assert.notEqual(result.href.includes(LOAD_ERROR_TITLE), true);
}

async function testAuthorBSharedSlugSelectsPracticeB() {
  const pageShared = read("src/lib/listen/page-shared.tsx");
  const selectSql = extractRenderListenPagePracticeSelect(pageShared);
  const result = await loadListenPage(selectSql, "zoya-petrova", SHARED_SLUG);

  assert.equal(result.kind, "redirect", "author B audio_post must redirect, not show load-error UI");
  if (result.kind !== "redirect") {
    return;
  }

  assert.equal(result.practiceId, authorBShared.id);
  assert.notEqual(result.practiceId, authorAShared.id);
  assert.equal(result.href, `/practice/zoya-petrova/${SHARED_SLUG}`);
}

async function testUniqueSlugControlRedirects() {
  const pageShared = read("src/lib/listen/page-shared.tsx");
  const selectSql = extractRenderListenPagePracticeSelect(pageShared);
  const result = await loadListenPage(
    selectSql,
    "sergey-and-zoya",
    UNIQUE_SLUG,
  );

  assert.equal(result.kind, "redirect", "unique-slug audio_post control must still redirect");
  if (result.kind !== "redirect") {
    return;
  }

  assert.equal(result.practiceId, authorAUnique.id);
  assert.equal(
    result.href,
    `/practice/sergey-and-zoya/${UNIQUE_SLUG}`,
  );
}

testSourceUsesInnerAuthorJoin();
await testCollisionWithoutInnerJoinShowsLoadError();
await testAuthorASharedSlugSelectsPracticeA();
await testAuthorBSharedSlugSelectsPracticeB();
await testUniqueSlugControlRedirects();

console.log("listen-page-slug-collision-unit: ok");
