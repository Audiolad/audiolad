#!/usr/bin/env node
/**
 * IndexNow runtime hooks unit checks — no live network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  planPracticePublishIndexNow,
  planPracticeSlugChangeIndexNow,
  buildAuthorCanonicalUrl,
  notifyIndexNowForTests,
} from "../src/lib/seo/indexnow/hooks.ts";
import {
  hasAuthorPublicIndexNowChanges,
  hasPracticePublicIndexNowChanges,
  resolvePlaylistIndexNowEvent,
} from "../src/lib/seo/indexnow/public-fields.ts";
import { INDEXNOW_REASONS } from "../src/lib/seo/indexnow/reasons.ts";
import { getIndexNowConfig } from "../src/lib/seo/indexnow/config.ts";
import { buildPracticeCanonicalUrl } from "../src/lib/products/paths.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testPracticePublishPlanner() {
  const first = planPracticePublishIndexNow({
    authorSlug: "sergey-petrov",
    practiceSlug: "aktivatsiya",
    isFirstPublishOfPractice: true,
    publishedCountBefore: 0,
  });

  assert(first.length === 2, "first publish: practice + author_became_public");
  assert(first[0].reason === INDEXNOW_REASONS.practice_published, "practice_published");
  assert(
    first[0].urls.includes(
      buildPracticeCanonicalUrl("sergey-petrov", "aktivatsiya"),
    ),
    "practice URL present",
  );
  assert(
    first[0].urls.includes(buildAuthorCanonicalUrl("sergey-petrov")),
    "author URL on first practice publish",
  );
  assert(first[1].reason === INDEXNOW_REASONS.author_became_public, "author_became_public");

  const republish = planPracticePublishIndexNow({
    authorSlug: "sergey-petrov",
    practiceSlug: "aktivatsiya",
    isFirstPublishOfPractice: false,
    publishedCountBefore: 3,
  });
  assert(republish.length === 1, "republish: one event");
  assert(republish[0].urls.length === 1, "republish: practice only");

  const anotherFirst = planPracticePublishIndexNow({
    authorSlug: "sergey-petrov",
    practiceSlug: "new-one",
    isFirstPublishOfPractice: true,
    publishedCountBefore: 2,
  });
  assert(anotherFirst.length === 1, "first of practice but author already public: one event");
  assert(anotherFirst[0].urls.length === 2, "still includes author URL once");
}

function testPracticePublicFields() {
  assert(
    hasPracticePublicIndexNowChanges({ title: "x", updated_at: "t" }),
    "title is public",
  );
  assert(
    hasPracticePublicIndexNowChanges({ price: 990, is_free: false }),
    "price/access public",
  );
  assert(
    !hasPracticePublicIndexNowChanges({ updated_at: "t" }),
    "updated_at alone is not public",
  );
  assert(
    !hasPracticePublicIndexNowChanges({ author_id: "uuid" }),
    "author_id alone not treated as public notify field",
  );
  assert(
    hasPracticePublicIndexNowChanges({ catalog_visibility: "unlisted" }),
    "visibility change is public-significant",
  );
  assert(
    hasPracticePublicIndexNowChanges({ is_catalog_listed: false }),
    "listing flag change is public-significant",
  );
}

function testSlugChange() {
  const planned = planPracticeSlugChangeIndexNow({
    authorSlug: "a",
    previousSlug: "old",
    nextSlug: "new",
  });
  assert(planned?.reason === INDEXNOW_REASONS.practice_slug_changed, "slug reason");
  assert(planned?.urls.length === 2, "old + new");
  assert(
    planPracticeSlugChangeIndexNow({
      authorSlug: "a",
      previousSlug: "same",
      nextSlug: "same",
    }) === null,
    "same slug → null",
  );
}

function testPlaylistEvents() {
  const published = resolvePlaylistIndexNowEvent({
    previousVisibility: "private",
    nextVisibility: "public",
    previousSlug: null,
    nextSlug: "my-list",
    titleChanged: true,
    editorialChanged: false,
  });
  assert(published.reason === "playlist_published", "playlist published");
  assert(published.slugs[0] === "my-list", "slug");

  const unpublished = resolvePlaylistIndexNowEvent({
    previousVisibility: "public",
    nextVisibility: "private",
    previousSlug: "my-list",
    nextSlug: null,
    titleChanged: false,
    editorialChanged: false,
  });
  assert(unpublished.reason === "playlist_unpublished", "playlist unpublished");
  assert(unpublished.slugs[0] === "my-list", "keeps previous slug");

  const privateUpdate = resolvePlaylistIndexNowEvent({
    previousVisibility: "private",
    nextVisibility: "private",
    previousSlug: null,
    nextSlug: null,
    titleChanged: true,
    editorialChanged: false,
  });
  assert(privateUpdate.reason === null, "private update → no notify");

  const publicUpdate = resolvePlaylistIndexNowEvent({
    previousVisibility: "public",
    nextVisibility: "public",
    previousSlug: "my-list",
    nextSlug: "my-list",
    titleChanged: true,
    editorialChanged: false,
  });
  assert(publicUpdate.reason === "playlist_updated", "public title update");
}

function testAuthorPublicFields() {
  assert(
    hasAuthorPublicIndexNowChanges({
      scalarUpdates: { name: "X", updated_at: "t" },
    }),
    "name public",
  );
  assert(
    hasAuthorPublicIndexNowChanges({ topicKeysProvided: true }),
    "topics public",
  );
  assert(
    hasAuthorPublicIndexNowChanges({ contactsProvided: true }),
    "contacts public",
  );
  assert(
    !hasAuthorPublicIndexNowChanges({
      scalarUpdates: { updated_at: "t" },
    }),
    "updated_at alone not public",
  );
}

async function testDisabledNoNetwork() {
  let fetchCalls = 0;
  const result = await notifyIndexNowForTests(
    ["https://audiolad.ru/practice/a/b"],
    INDEXNOW_REASONS.practice_published,
    {
      env: {
        INDEXNOW_ENABLED: "false",
        INDEXNOW_KEY: "unit-test-indexnow-key-01",
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://audiolad.ru",
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(null, { status: 202 });
      },
    },
  );

  assert(result.status === "disabled", "disabled when INDEXNOW_ENABLED=false");
  assert(fetchCalls === 0, "no network when disabled");
}

async function testFailureDoesNotThrow() {
  const env = {
    INDEXNOW_ENABLED: "true",
    INDEXNOW_KEY: "unit-test-indexnow-key-01",
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://audiolad.ru",
  };
  const config = getIndexNowConfig(env, {
    indexingEnabled: true,
    appOrigin: "https://audiolad.ru",
  });
  assert(config.canSubmit === true, "test config canSubmit");

  const result = await notifyIndexNowForTests(
    ["https://audiolad.ru/practice/a/b"],
    INDEXNOW_REASONS.practice_updated,
    {
      config,
      fetchImpl: async () => {
        throw new Error("network down");
      },
      sleepImpl: async () => {},
    },
  );

  assert(
    result.status === "failed" || result.status === "partial",
    "network failure returns failed/partial, does not throw",
  );
}

function testRouteWiringSource() {
  const files = [
    "src/app/api/author/products/[id]/publish/route.ts",
    "src/app/api/author/products/[id]/unpublish/route.ts",
    "src/app/api/author/products/[id]/archive/route.ts",
    "src/app/api/author/products/[id]/route.ts",
    "src/app/api/author/products/[id]/topics/route.ts",
    "src/app/api/author/products/[id]/cover/route.ts",
    "src/app/api/playlists/route.ts",
    "src/app/api/playlists/[id]/route.ts",
    "src/app/api/author/profile/route.ts",
    "src/app/api/author/profile/[kind]/route.ts",
    "src/app/api/author/profile/banner-position/route.ts",
  ];

  for (const file of files) {
    const source = read(file);
    assert(
      source.includes("scheduleIndexNowNotification"),
      `${file} schedules IndexNow`,
    );
    assert(!/INDEXNOW_KEY\s*=\s*["'][A-Za-z0-9-]{16,}/.test(source), `${file} no key literal`);
  }

  const hooks = read("src/lib/seo/indexnow/hooks.ts");
  assert(hooks.includes('from "next/server"'), "uses next/server after()");
  assert(hooks.includes("after("), "after() fire-and-forget");
}

function testNoKeyInLogsHelper() {
  const notify = read("src/lib/seo/indexnow/notify.ts");
  assert(notify.includes('blocked = new Set(["key"'), "log redaction blocks key");
  assert(!notify.includes("console.info(`[indexnow] ${message}`, config.key)"), "no key log");
}

async function main() {
  testPracticePublishPlanner();
  testPracticePublicFields();
  testSlugChange();
  testPlaylistEvents();
  testAuthorPublicFields();
  await testDisabledNoNetwork();
  await testFailureDoesNotThrow();
  testRouteWiringSource();
  testNoKeyInLogsHelper();
  console.log("indexnow-hooks-unit: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
