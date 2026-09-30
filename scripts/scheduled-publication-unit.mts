import assert from "node:assert/strict";

import { isPublicCatalogPracticeRow } from "../src/lib/fixtures/test-fixture-marker";
import { canRevealPublicProductPage } from "../src/lib/products/publish-preview";
import {
  adminAwaitingPublicationLabel,
  adminScheduledPublicationLine,
  authorPublicationScheduleLine,
  formatMskPublicationStamp,
  isPracticePubliclyAvailable,
  mskWallClockToUtcIso,
  practicePublicAvailabilityOrFilter,
  utcIsoToMskFields,
} from "../src/lib/products/scheduled-publication";
import { planPracticePublishedSearchNotifications } from "../src/lib/seo/practice-publish-plan";

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

console.log("scheduled-publication-unit: ok");
