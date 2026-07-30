#!/usr/bin/env node
/**
 * Regression: draft/preview must not leak into public rails; music on topic hubs;
 * publish UX distinguishes preview from actual publication.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isPracticeCatalogListed } from "../src/lib/products/access.ts";
import { requiresPublishPreviewBeforePublish } from "../src/lib/products/publish-preview.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  assert.equal(
    isPracticeCatalogListed({ status: "draft", is_catalog_listed: true }),
    false,
    "draft is not catalog-listed even if flag true",
  );
  assert.equal(
    isPracticeCatalogListed({ status: "published", is_catalog_listed: true }),
    true,
    "published + listed is public",
  );
  assert.equal(
    requiresPublishPreviewBeforePublish(null),
    true,
    "first publish requires preview",
  );
  assert.equal(
    requiresPublishPreviewBeforePublish("2026-07-30T00:00:00.000Z"),
    false,
    "republish path after published_at",
  );

  const homeListen = read("src/lib/home/listening-progress.ts");
  assert.match(homeListen, /isPracticeCatalogListed/);
  assert.match(homeListen, /\.eq\("status", "published"\)/);
  assert.match(homeListen, /\.eq\("is_catalog_listed", true\)/);

  const topicHubLoad = read("src/lib/seo/topic-hubs/load.ts");
  assert.doesNotMatch(
    topicHubLoad,
    /productKind:\s*PRODUCT_KIND\.PRACTICE/,
    "topic hubs must not exclude music",
  );
  assert.match(topicHubLoad, /including music/);

  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  assert.match(form, /Предпросмотр и публикация/);
  assert.match(
    form,
    /Нажмите «Опубликовать» на странице предпросмотра/,
  );
  assert.match(form, /Продукт опубликован и доступен в каталоге/);
  assert.match(form, /break-words/);
  assert.match(form, /refreshIfPublishedElsewhere|focus/);

  const banner = read(
    "src/components/products/practice-page/PublishPreviewBanner.tsx",
  );
  assert.match(banner, /published=1/);

  const authorsList = read("src/lib/authors/public-list-data.ts");
  assert.match(authorsList, /\.eq\("status", "published"\)/);
  assert.match(authorsList, /\.eq\("is_catalog_listed", true\)/);

  const profile = read(
    "src/components/author-dashboard/AuthorProfileClient.tsx",
  );
  assert.match(profile, /списке авторов/);

  const catalog = read("src/lib/products/catalog.ts");
  assert.match(catalog, /\.eq\("status", "published"\)/);
  assert.doesNotMatch(
    catalog,
    /productKind:\s*PRODUCT_KIND\.PRACTICE/,
    "main catalog helper must not hardcode practice-only",
  );

  const saleLock = read("src/lib/author-products/sale-lock.ts");
  assert.match(saleLock, /PRODUCT_CONTENT_LOCKED_AFTER_SALE|sale.?lock/i);

  console.log("aurafon-publish-visibility-unit: ok");
}

main();
