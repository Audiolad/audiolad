#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hasPracticePublicIndexNowChanges } from "../src/lib/seo/indexnow/public-fields.ts";
import { planPracticePublishedSearchNotifications } from "../src/lib/seo/practice-publish-plan.ts";
import { buildPracticeCanonicalUrl } from "../src/lib/products/paths.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

assert.equal(
  hasPracticePublicIndexNowChanges({ seo_primary_query: "медитация для сна" }),
  true,
);
assert.equal(hasPracticePublicIndexNowChanges({ seo_title: "Сон" }), true);
assert.equal(
  hasPracticePublicIndexNowChanges({ seo_description: "Описание" }),
  true,
);

const publishedListed = planPracticePublishedSearchNotifications({
  authorSlug: "sergey",
  practiceSlug: "lavandovyy-son",
  previousStatus: "draft",
  nextStatus: "published",
  catalogVisibility: "listed",
  isCatalogListed: true,
  isFirstPublishOfPractice: true,
  publishedCountBefore: 0,
});
assert.ok(publishedListed.indexNow.length > 0);
assert.equal(publishedListed.yandex?.reason, "practice_published");
assert.equal(
  publishedListed.yandex?.url,
  buildPracticeCanonicalUrl("sergey", "lavandovyy-son"),
);

const adminApprove = planPracticePublishedSearchNotifications({
  authorSlug: "sergey",
  practiceSlug: "lavandovyy-son",
  previousStatus: "draft",
  nextStatus: "published",
  catalogVisibility: "listed",
  isCatalogListed: true,
  isFirstPublishOfPractice: true,
  publishedCountBefore: 2,
});
assert.ok(
  adminApprove.indexNow.some((event) =>
    event.urls.includes(buildPracticeCanonicalUrl("sergey", "lavandovyy-son")),
  ),
);
assert.equal(
  adminApprove.yandex?.url,
  buildPracticeCanonicalUrl("sergey", "lavandovyy-son"),
);

const publishRoute = read("src/app/api/author/products/[id]/publish/route.ts");
assert.match(publishRoute, /schedulePracticePublishedSearchNotifications/);
assert.match(publishRoute, /publishPracticeProduct/);
assert.match(
  publishRoute,
  /publishPracticeProduct[\s\S]*schedulePracticePublishedSearchNotifications[\s\S]*NextResponse\.json/,
);
assert.doesNotMatch(
  publishRoute,
  /scheduleIndexNowNotification/,
  "publish must not call IndexNow directly in addition to the shared helper",
);

const adminActions = read(
  "src/app/(platform)/admin/product-moderation/actions.ts",
);
assert.match(adminActions, /approveAndPublishPractice/);
assert.match(adminActions, /schedulePracticePublishedSearchNotifications/);
assert.match(
  adminActions,
  /approveAndPublishPractice[\s\S]*schedulePracticePublishedSearchNotifications/,
);
assert.doesNotMatch(
  adminActions,
  /scheduleIndexNowNotification/,
  "admin approve must not call IndexNow directly in addition to the shared helper",
);

const helper = read("src/lib/seo/practice-publish-notifications.ts");
assert.match(helper, /scheduleIndexNowNotification/);
assert.match(helper, /scheduleYandexRecrawlNotification/);
assert.match(helper, /Fail-open/);

const patchRoute = read("src/app/api/author/products/[id]/route.ts");
assert.match(patchRoute, /planPracticeYandexRecrawl/);
assert.match(patchRoute, /scheduleYandexRecrawlNotification/);

const articleFiles = [
  "src/lib/seo/listens/registry.ts",
  "src/app/(platform)/(listener)/listens/[slug]/page.tsx",
  "src/app/(platform)/(listener)/articles/[slug]/page.tsx",
];
for (const file of articleFiles) {
  const source = read(file);
  assert.doesNotMatch(
    source,
    /yandex-webmaster/,
    `${file} must not wire Webmaster Recrawl`,
  );
}

const yandexClient = read("src/lib/seo/yandex-webmaster/client.ts");
assert.doesNotMatch(yandexClient, /NEXT_PUBLIC_YANDEX/);
assert.match(yandexClient, /auth_failed/);

console.log("yandex-webmaster-hooks-unit: ok");
