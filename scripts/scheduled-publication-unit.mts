import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isPublicCatalogPracticeRow } from "../src/lib/fixtures/test-fixture-marker";
import { resolveProductAccess } from "../src/lib/products/access";
import { resolveListenAccess } from "../src/lib/listen/access";
import { resolveLibraryAction } from "../src/lib/products/practice-access-ui";
import {
  createMemoryScheduledPublishStore,
  deliverPendingScheduledPublishEvents,
  type MemoryScheduledPractice,
} from "../src/lib/products/scheduled-publish-outbox";
import { canRevealPublicProductPage } from "../src/lib/products/publish-preview";
import {
  adminAwaitingPublicationLabel,
  adminScheduledPublicationLine,
  authorPublicationScheduleLine,
  effectivePublishedAt,
  formatMskPublicationStamp,
  isPracticePubliclyAvailable,
  mskWallClockToUtcIso,
  practicePublicAvailabilityOrFilter,
  publicReleaseSortTimestamp,
  resolvePracticePublicLastModified,
  utcIsoToMskFields,
} from "../src/lib/products/scheduled-publication";
import {
  planClaimedPublicationNotifications,
  planPracticePublishedSearchNotifications,
} from "../src/lib/seo/practice-publish-plan";

const FUTURE = "2026-10-15T07:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";
const NOW = new Date("2026-09-30T12:00:00.000Z");

assert.equal(
  isPracticePubliclyAvailable({
    status: "published",
    scheduledPublishAt: null,
    publishedAt: PAST,
    now: NOW,
  }),
  true,
  "published without schedule is public",
);

assert.equal(
  isPracticePubliclyAvailable({
    status: "published",
    scheduledPublishAt: FUTURE,
    publishedAt: null,
    now: NOW,
  }),
  false,
  "approved future schedule is not public",
);

assert.equal(
  isPracticePubliclyAvailable({
    status: "published",
    scheduledPublishAt: PAST,
    publishedAt: null,
    now: NOW,
  }),
  true,
  "approved schedule already due is public",
);

assert.equal(
  isPracticePubliclyAvailable({
    status: "draft",
    scheduledPublishAt: PAST,
    publishedAt: null,
    now: NOW,
  }),
  false,
  "schedule in the past without moderation is not public",
);

assert.equal(
  isPracticePubliclyAvailable({
    status: "published",
    scheduledPublishAt: PAST,
    publishedAt: null,
    now: new Date("2026-10-01T00:00:00.000Z"),
  }),
  true,
  "approval after the schedule has passed is public",
);

assert.equal(
  isPracticePubliclyAvailable({
    status: "published",
    scheduledPublishAt: FUTURE,
    publishedAt: PAST,
    now: NOW,
  }),
  true,
  "a future schedule cannot hide a product that already went live",
);

assert.equal(
  mskWallClockToUtcIso("2026-09-30", "18:00"),
  "2026-09-30T15:00:00.000Z",
);
assert.deepEqual(utcIsoToMskFields("2026-09-30T15:00:00.000Z"), {
  date: "2026-09-30",
  time: "18:00",
});
assert.equal(
  formatMskPublicationStamp("2026-10-15T07:00:00.000Z"),
  "15 октября 2026, 10:00 МСК",
);
assert.equal(
  formatMskPublicationStamp("2026-10-15T07:00:00.000Z", { withYear: false }),
  "15 октября в 10:00 МСК",
);

const filter = practicePublicAvailabilityOrFilter(NOW);
assert.match(filter, /published_at\.lte\./);
assert.match(filter, /scheduled_publish_at\.is\.null/);
assert.match(filter, /scheduled_publish_at\.lte\./);
assert.equal(filter.includes("2026-09-30T12:00:00.000Z"), true);

assert.equal(
  isPublicCatalogPracticeRow({
    status: "published",
    is_catalog_listed: true,
    slug: "utro",
    author_id: "author",
    scheduled_publish_at: FUTURE,
    published_at: null,
  }),
  false,
  "sitemap helper excludes a future schedule",
);
assert.equal(
  isPublicCatalogPracticeRow({
    status: "published",
    is_catalog_listed: true,
    slug: "utro",
    author_id: "author",
    scheduled_publish_at: null,
    published_at: PAST,
  }),
  true,
);

const guestAccess = {
  isAuthorMember: false,
  hasEntitlement: false,
  canSeeSelectedUsers: false,
};
assert.equal(
  canRevealPublicProductPage({
    practiceStatus: "published",
    access: guestAccess,
    catalogVisibility: "listed",
    isCatalogListed: true,
    scheduledPublishAt: FUTURE,
    publishedAt: null,
    now: NOW,
  }),
  false,
);
assert.equal(
  canRevealPublicProductPage({
    practiceStatus: "published",
    access: { ...guestAccess, isAuthorMember: true },
    catalogVisibility: "listed",
    isCatalogListed: true,
    scheduledPublishAt: FUTURE,
    publishedAt: null,
    now: NOW,
  }),
  true,
  "author still sees the product before the scheduled time",
);

assert.equal(
  authorPublicationScheduleLine({
    status: "draft",
    moderationStatus: "not_submitted",
    scheduledPublishAt: FUTURE,
    publishedAt: null,
    now: NOW,
  }),
  "Публикация запланирована на 15 октября в 10:00 МСК",
);
assert.equal(
  authorPublicationScheduleLine({
    status: "published",
    moderationStatus: "approved",
    scheduledPublishAt: FUTURE,
    publishedAt: null,
    now: NOW,
  }),
  "Одобрено модератором · выйдет 15 октября в 10:00 МСК",
);
assert.equal(
  adminScheduledPublicationLine(FUTURE),
  "Запланированная публикация: 15 октября 2026, 10:00 МСК",
);
assert.equal(
  adminAwaitingPublicationLabel({
    status: "published",
    moderationStatus: "approved",
    scheduledPublishAt: FUTURE,
    publishedAt: null,
    now: NOW,
  }),
  "Одобрено · ожидает публикации",
);

const hiddenPlan = planPracticePublishedSearchNotifications({
  authorSlug: "author",
  practiceSlug: "utro",
  previousStatus: "draft",
  nextStatus: "published",
  catalogVisibility: "listed",
  isCatalogListed: true,
  isFirstPublishOfPractice: true,
  publishedCountBefore: 0,
  publiclyAvailable: false,
});
assert.deepEqual(hiddenPlan.indexNow, []);
assert.equal(hiddenPlan.yandex, null);

const openPlan = planPracticePublishedSearchNotifications({
  authorSlug: "author",
  practiceSlug: "utro",
  previousStatus: "draft",
  nextStatus: "published",
  catalogVisibility: "listed",
  isCatalogListed: true,
  isFirstPublishOfPractice: true,
  publishedCountBefore: 1,
  publiclyAvailable: true,
});
assert.ok(openPlan.indexNow.length > 0 || openPlan.yandex);

const GO_LIVE = mskWallClockToUtcIso("2026-10-15", "10:00");
assert.equal(GO_LIVE, "2026-10-15T07:00:00.000Z");
const BEFORE_GO_LIVE = new Date("2026-10-15T06:59:00.000Z");
const AFTER_GO_LIVE = new Date("2026-10-15T07:00:01.000Z");
const APPROVAL_MOMENT = "2026-10-20T09:30:00.000Z";
const OLDER_RELEASE = "2026-10-01T07:00:00.000Z";

assert.equal(
  isPracticePubliclyAvailable({
    status: "published",
    scheduledPublishAt: GO_LIVE,
    publishedAt: null,
    now: BEFORE_GO_LIVE,
  }),
  false,
  "15 Oct 10:00 MSK is not public one minute earlier",
);
assert.equal(
  isPracticePubliclyAvailable({
    status: "published",
    scheduledPublishAt: GO_LIVE,
    publishedAt: null,
    now: AFTER_GO_LIVE,
  }),
  true,
  "15 Oct 10:00 MSK is public after that instant",
);
assert.equal(
  effectivePublishedAt({
    status: "published",
    scheduledPublishAt: GO_LIVE,
    publishedAt: null,
    now: BEFORE_GO_LIVE,
  }),
  null,
);
assert.equal(
  effectivePublishedAt({
    status: "published",
    scheduledPublishAt: GO_LIVE,
    publishedAt: null,
    now: AFTER_GO_LIVE,
  }),
  GO_LIVE,
  "elapsed schedule is the factual go-live",
);
assert.equal(
  effectivePublishedAt({
    status: "published",
    scheduledPublishAt: GO_LIVE,
    publishedAt: APPROVAL_MOMENT,
    now: new Date("2026-10-20T10:00:00.000Z"),
  }),
  APPROVAL_MOMENT,
  "approval after a past schedule uses the approval instant",
);

const dueSort = publicReleaseSortTimestamp({
  status: "published",
  scheduledPublishAt: GO_LIVE,
  publishedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  now: AFTER_GO_LIVE,
});
const olderSort = publicReleaseSortTimestamp({
  status: "published",
  publishedAt: OLDER_RELEASE,
  createdAt: "2026-10-14T00:00:00.000Z",
  now: AFTER_GO_LIVE,
});
assert.ok(dueSort > olderSort, "elapsed schedule sorts ahead of an older release");
assert.equal(
  resolvePracticePublicLastModified({
    updatedAt: "2026-10-01T12:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    status: "published",
    scheduledPublishAt: GO_LIVE,
    publishedAt: null,
    now: AFTER_GO_LIVE,
  }),
  GO_LIVE,
);

const claimed = [
  {
    practiceId: "practice-b",
    authorId: "author-1",
    practiceSlug: "later",
    authorSlug: "author",
    catalogVisibility: "listed",
    isCatalogListed: true,
    publishedAt: "2026-10-15T08:00:00.000Z",
    priorPublicCount: 0,
  },
  {
    practiceId: "practice-a",
    authorId: "author-1",
    practiceSlug: "sooner",
    authorSlug: "author",
    catalogVisibility: "listed",
    isCatalogListed: true,
    publishedAt: GO_LIVE ?? "",
    priorPublicCount: 0,
  },
];
const firstNotify = planClaimedPublicationNotifications(claimed);
const secondNotify = planClaimedPublicationNotifications([]);
assert.equal(firstNotify.length, 2);
assert.equal(firstNotify[0]?.practiceSlug, "sooner");
assert.equal(firstNotify[0]?.publishedCountBefore, 0);
assert.equal(firstNotify[0]?.isFirstPublishOfPractice, true);
assert.equal(firstNotify[1]?.publishedCountBefore, 1);
assert.equal(secondNotify.length, 0);
const livePlan = planPracticePublishedSearchNotifications(firstNotify[0]!);
assert.ok(livePlan.indexNow.length > 0);
assert.ok(livePlan.yandex);

const supabase = {} as SupabaseClient;
const freePractice = {
  id: "free-1",
  author_id: "author-1",
  is_free: true,
  status: "published",
  is_catalog_listed: true,
  catalog_visibility: "listed",
  scheduled_publish_at: GO_LIVE,
  published_at: null,
  price: null,
  format: "Аудиопрактика",
};
const guestPractice = {
  ...freePractice,
  id: "guest-1",
  is_free: false,
  guest_access_enabled: true,
  price: 100,
};

const freeBefore = await resolveProductAccess(
  supabase,
  freePractice,
  null,
  { now: BEFORE_GO_LIVE },
);
assert.equal(freeBefore.canListen, false);
assert.equal(freeBefore.canAcquire, false);
assert.equal(
  await resolveListenAccess(supabase, null, freePractice, { now: BEFORE_GO_LIVE }),
  null,
);
const farFutureFree = {
  ...freePractice,
  scheduled_publish_at: "2099-06-01T07:00:00.000Z",
};
const farFutureAccess = await resolveProductAccess(supabase, farFutureFree, null);
assert.equal(farFutureAccess.canListen, false);
assert.equal(farFutureAccess.canAcquire, false);
assert.equal(
  await resolveListenAccess(supabase, null, farFutureFree),
  null,
);
assert.equal(
  resolveLibraryAction({
    access: farFutureAccess,
    practice: farFutureFree,
    isAuthenticated: true,
    buyerPreviewMode: false,
  }),
  "hidden",
);

const guestBefore = await resolveProductAccess(
  supabase,
  guestPractice,
  null,
  { now: BEFORE_GO_LIVE },
);
assert.equal(guestBefore.canListen, false);
assert.equal(guestBefore.canAcquire, false);
assert.equal(
  await resolveListenAccess(supabase, null, guestPractice, {
    now: BEFORE_GO_LIVE,
  }),
  null,
);

const freeAfter = await resolveProductAccess(
  supabase,
  freePractice,
  null,
  { now: AFTER_GO_LIVE },
);
assert.equal(freeAfter.canListen, true);
assert.equal(freeAfter.reason, "free");
assert.deepEqual(
  await resolveListenAccess(supabase, null, freePractice, { now: AFTER_GO_LIVE }),
  { mode: "entitled" },
);

const guestAfter = await resolveProductAccess(
  supabase,
  guestPractice,
  null,
  { now: AFTER_GO_LIVE },
);
assert.equal(guestAfter.canListen, true);
assert.equal(guestAfter.reason, "guest_promo");
assert.deepEqual(
  await resolveListenAccess(supabase, null, guestPractice, { now: AFTER_GO_LIVE }),
  { mode: "entitled" },
);

const releaseSource = readFileSync(
  "src/lib/products/release-due-scheduled-publications.ts",
  "utf8",
);
assert.match(releaseSource, /import "server-only"/);
assert.match(releaseSource, /createServiceRoleClient\(\)/);
assert.match(
  releaseSource,
  /export async function releaseDueScheduledPublications\(\)/,
);
assert.doesNotMatch(
  releaseSource,
  /releaseDueScheduledPublications\(\s*[A-Za-z]/,
);

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(path);
    }
  }

  return files;
}

for (const path of listSourceFiles("src")) {
  if (path.endsWith("release-due-scheduled-publications.ts")) {
    continue;
  }

  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(
    source,
    /releaseDueScheduledPublications\(\s*[^)\s]/,
    `${path} must not pass a user client into the claim`,
  );
}

function duePractice(
  id: string,
  catalogVisibility: string,
): MemoryScheduledPractice {
  return {
    id,
    authorId: "author-1",
    practiceSlug: `slug-${id}`,
    authorSlug: "author",
    catalogVisibility,
    isCatalogListed: catalogVisibility === "listed",
    status: "published",
    scheduledPublishAt: "2026-10-15T07:00:00.000Z",
    publishedAt: null,
  };
}

const hidden = duePractice("hidden-1", "selected_users");
const guard = createMemoryScheduledPublishStore(
  () => Date.parse("2026-10-15T07:00:01.000Z"),
);
assert.throws(
  () => guard.claim("anon", [hidden]),
  /permission denied/,
  "anon cannot call the claim",
);
assert.throws(
  () => guard.claim("authenticated", [hidden]),
  /permission denied/,
  "authenticated cannot call the claim",
);
assert.equal(hidden.publishedAt, null, "denied claim does not stamp");
const hiddenClaim = guard.claim("service_role", [hidden]);
assert.equal(hiddenClaim, 1);
assert.equal(typeof hiddenClaim, "number");
assert.equal(JSON.stringify(hiddenClaim).includes("slug-hidden-1"), false);
assert.equal(hidden.publishedAt, "2026-10-15T07:00:00.000Z");
assert.throws(
  () => guard.take("anon"),
  /permission denied/,
  "anon cannot read claimed selected_users rows",
);

const once = createMemoryScheduledPublishStore(
  () => Date.parse("2026-10-15T07:00:01.000Z"),
);
const listed = duePractice("listed-1", "listed");
assert.equal(once.claim("service_role", [listed]), 1);
assert.equal(once.claim("service_role", [listed]), 0);
assert.equal(once.eventCount(), 1, "parallel and repeated claims create one event");

const durable = createMemoryScheduledPublishStore(
  () => Date.parse("2026-10-15T07:00:01.000Z"),
);
const durablePractice = duePractice("listed-2", "listed");
assert.equal(durable.claim("service_role", [durablePractice]), 1);
assert.deepEqual(durable.pendingIds(), ["listed-2"]);
let attempts = 0;
const crashed = await deliverPendingScheduledPublishEvents({
  take: async () => durable.take("service_role"),
  complete: async (ids) => durable.complete("service_role", ids),
  abandon: async (ids) => durable.abandon("service_role", ids),
  notify: async () => {
    attempts += 1;
    throw new Error("process died before IndexNow");
  },
});
assert.deepEqual(crashed.delivered, []);
assert.deepEqual(durable.pendingIds(), ["listed-2"]);
const recovered = await deliverPendingScheduledPublishEvents({
  take: async () => durable.take("service_role"),
  complete: async (ids) => durable.complete("service_role", ids),
  abandon: async (ids) => durable.abandon("service_role", ids),
  notify: async () => {
    attempts += 1;
    return true;
  },
});
assert.deepEqual(recovered.delivered, ["listed-2"]);
assert.equal(attempts, 2);
const again = await deliverPendingScheduledPublishEvents({
  take: async () => durable.take("service_role"),
  complete: async (ids) => durable.complete("service_role", ids),
  abandon: async (ids) => durable.abandon("service_role", ids),
  notify: async () => {
    attempts += 1;
    return true;
  },
});
assert.deepEqual(again.delivered, []);
assert.equal(attempts, 2, "processed event is not sent again");

console.log("scheduled-publication-unit: ok");
