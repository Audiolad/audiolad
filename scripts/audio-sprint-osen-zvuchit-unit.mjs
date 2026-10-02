#!/usr/bin/env node
/**
 * AudioSprint v1 «Осень звучит».
 * Sprint UI, title lock, and moderation gates.
 * Practice reservation/link stays on the PR #698 path and is not reimplemented.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isProductCreateSeoDiscoveryEnabled } from "../src/lib/seo-queries/discovery-beta.ts";
import { isSeoReservationProductLinkAllowed } from "../src/lib/seo-queries/reservation-product-link-gate.ts";
import { planSeoQueryReserve } from "../src/lib/seo-queries/published-query-occupancy.ts";
import { SEO_ACTIVE_RESERVATION_LIMIT } from "../src/lib/seo-queries/types.ts";
import {
  AUDIO_SPRINT_GROUP_LABEL,
  AUDIO_SPRINT_OSEN_ZVUCHIT_SLUG,
  AUDIO_SPRINT_OSEN_ZVUCHIT_TITLE,
  audioSprintEnabledPools,
  audioSprintHref,
  audioSprintHasCover,
  audioSprintProductMatchesGroup,
  audioSprintPublicationClass,
  audioSprintReserveConflictLifecycle,
  buildAudioSprintProductCreateHref,
  canReserveAudioSprintQuery,
  evaluateAudioSprintModerationGate,
  evaluateAudioSprintTitleSave,
  isAudioSprintPoolVisible,
  reservePoolEnabled,
  selectVisibleAudioSprintQueries,
} from "../src/lib/seo-queries/audio-sprint.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const OTHER = "00000000-0000-4000-8000-000000000099";
const AUTHOR_A = "00000000-0000-4000-8000-0000000000a1";
const AUTHOR_B = "00000000-0000-4000-8000-0000000000b2";
const QUERY_ID = "00000000-0000-4000-8000-0000000000c3";

assert.equal(reservePoolEnabled, false);
assert.deepEqual(audioSprintEnabledPools(), ["initial"]);
assert.equal(isAudioSprintPoolVisible("initial"), true);
assert.equal(isAudioSprintPoolVisible("reserve"), false);
assert.equal(AUDIO_SPRINT_OSEN_ZVUCHIT_SLUG, "osen-zvuchit-2026");
assert.equal(AUDIO_SPRINT_OSEN_ZVUCHIT_TITLE, "Осень звучит");
assert.equal(AUDIO_SPRINT_GROUP_LABEL.music, "Музыка");
assert.equal(AUDIO_SPRINT_GROUP_LABEL.voice, "Медитации и практики");
assert.equal(SEO_ACTIVE_RESERVATION_LIMIT, 5);
assert.equal(
  audioSprintHref("aurafon"),
  "/author-dashboard/audio-sprints/osen-zvuchit-2026?author=aurafon",
);

const mixed = [
  { queryText: "Яблоко", authorGroup: "music", pool: "initial" },
  { queryText: "Арбуз", authorGroup: "voice", pool: "reserve" },
  { queryText: "Груша", authorGroup: "voice", pool: "initial" },
  { queryText: "Банан", authorGroup: "music", pool: "initial" },
];
const visible = selectVisibleAudioSprintQueries(mixed);
assert.deepEqual(
  visible.map((item) => item.queryText),
  ["Банан", "Груша", "Яблоко"],
);
assert.equal(visible.some((item) => item.pool === "reserve"), false);
assert.deepEqual(
  visible.filter((item) => item.authorGroup === "music").map((item) => item.queryText),
  ["Банан", "Яблоко"],
);
assert.deepEqual(
  visible.filter((item) => item.authorGroup === "voice").map((item) => item.queryText),
  ["Груша"],
);

assert.equal(audioSprintPublicationClass("music"), "release");
assert.equal(audioSprintPublicationClass("voice"), "practice");
assert.equal(
  buildAudioSprintProductCreateHref({
    authorSlug: "demo",
    reservationId: "11111111-1111-4111-8111-111111111111",
    authorGroup: "music",
  }),
  "/author-dashboard/products/new?author=demo&seo_reservation_id=11111111-1111-4111-8111-111111111111&class=release",
);
assert.equal(
  buildAudioSprintProductCreateHref({
    authorSlug: "demo",
    reservationId: "22222222-2222-4222-8222-222222222222",
    authorGroup: "voice",
  }),
  "/author-dashboard/products/new?author=demo&seo_reservation_id=22222222-2222-4222-8222-222222222222&class=practice",
);

assert.equal(
  canReserveAudioSprintQuery({
    lifecycle: "available",
    isOwnReservation: false,
    activeReservationCount: 4,
  }),
  true,
);
assert.equal(
  canReserveAudioSprintQuery({
    lifecycle: "available",
    isOwnReservation: false,
    activeReservationCount: SEO_ACTIVE_RESERVATION_LIMIT,
  }),
  false,
  "global limit of 5 is unchanged",
);
assert.equal(
  canReserveAudioSprintQuery({
    lifecycle: "in_progress",
    isOwnReservation: false,
    activeReservationCount: 0,
  }),
  false,
  "foreign occupied query cannot be reserved",
);
assert.equal(
  canReserveAudioSprintQuery({
    lifecycle: "available",
    isOwnReservation: true,
    activeReservationCount: 1,
  }),
  false,
);

const taken = planSeoQueryReserve({
  authorId: AUTHOR_B,
  queryId: QUERY_ID,
  analysisStatus: "analyzed",
  activeReservationCount: 0,
  reservations: [
    { id: "res-a", queryId: QUERY_ID, authorId: AUTHOR_A, status: "active" },
  ],
  publishedOccupancy: false,
});
assert.deepEqual(taken, { action: "reject", code: "seo_query_already_reserved" });

const atLimit = planSeoQueryReserve({
  authorId: AUTHOR_A,
  queryId: "00000000-0000-4000-8000-0000000000d4",
  analysisStatus: "analyzed",
  activeReservationCount: 5,
  reservations: [],
  publishedOccupancy: false,
});
assert.deepEqual(atLimit, { action: "reject", code: "seo_reservation_limit_reached" });

const ownStillOk = planSeoQueryReserve({
  authorId: AUTHOR_A,
  queryId: QUERY_ID,
  analysisStatus: "analyzed",
  activeReservationCount: 5,
  reservations: [
    { id: "res-a", queryId: QUERY_ID, authorId: AUTHOR_A, status: "active" },
  ],
  publishedOccupancy: false,
});
assert.equal(ownStillOk.action, "return_existing");

assert.equal(
  evaluateAudioSprintTitleSave({
    sprintQueryText: "Осенняя музыка для сна",
    nextTitle: "  Осенняя музыка для сна  ",
  }),
  null,
);
assert.equal(
  evaluateAudioSprintTitleSave({
    sprintQueryText: "Осенняя музыка для сна",
    nextTitle: "Другое название",
  })?.code,
  "audio_sprint_title_locked",
);
assert.equal(
  evaluateAudioSprintTitleSave({
    sprintQueryText: null,
    nextTitle: "Любое название",
  }),
  null,
  "ordinary product title stays editable",
);

const usageItems = [
  { content: "Слушайте вечером" },
  { content: "Снизьте громкость" },
  { content: "Не ставьте на паузу" },
];
const faqItems = [
  { question: "Когда слушать?", answer: "Перед сном." },
  { question: "Сколько длится?", answer: "Один трек." },
  { question: "Нужны ли слова?", answer: "Нет, это музыка." },
];
const readySprint = {
  isSprintProduct: true,
  authorGroup: "music",
  publicationClass: "release",
  productKind: "music",
  isFree: true,
  catalogVisibility: "listed",
  isCatalogListed: true,
  title: "Осенняя музыка для сна",
  queryText: "Осенняя музыка для сна",
  subtitle: "Спокойный фон для засыпания",
  description: "Инструментальная осенняя музыка без слов.",
  seoTitle: "Осенняя музыка для сна — АудиоЛад",
  seoDescription: "Спокойная осенняя музыка для сна.",
  usageItems,
  faqItems,
  coverUrl: "https://cdn.example/cover.jpg",
  coverImage: null,
};
assert.equal(evaluateAudioSprintModerationGate(readySprint), null);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    coverUrl: "  ",
    coverImage: { variants: { lg: { path: "covers/osen.jpg" } } },
  }),
  null,
  "a cover manifest counts without a legacy URL",
);
assert.equal(
  evaluateAudioSprintModerationGate({ ...readySprint, isFree: false })?.code,
  "audio_sprint_must_be_free",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    catalogVisibility: "unlisted",
  })?.code,
  "audio_sprint_must_be_listed",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    catalogVisibility: "selected_users",
  })?.code,
  "audio_sprint_must_be_listed",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    isCatalogListed: false,
  })?.code,
  "audio_sprint_must_be_listed",
);
assert.equal(
  evaluateAudioSprintModerationGate({ ...readySprint, title: "Другое" })?.code,
  "audio_sprint_title_locked",
);
assert.equal(
  evaluateAudioSprintModerationGate({ ...readySprint, subtitle: "  " })?.code,
  "audio_sprint_seo_required",
);
assert.equal(
  evaluateAudioSprintModerationGate({ ...readySprint, description: "" })?.code,
  "audio_sprint_seo_required",
);
assert.equal(
  evaluateAudioSprintModerationGate({ ...readySprint, seoTitle: "" })?.code,
  "audio_sprint_seo_required",
);
assert.equal(
  evaluateAudioSprintModerationGate({ ...readySprint, seoDescription: null })?.code,
  "audio_sprint_seo_required",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    usageItems: usageItems.slice(0, 2),
  })?.code,
  "audio_sprint_seo_required",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    usageItems: [...usageItems, { content: "Четвёртый пункт" }],
  })?.code,
  "audio_sprint_seo_required",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    faqItems: faqItems.map((item, index) =>
      index === 2 ? { ...item, answer: " " } : item,
    ),
  })?.code,
  "audio_sprint_seo_required",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    coverUrl: "",
    coverImage: null,
  })?.code,
  "audio_sprint_seo_required",
);
assert.equal(audioSprintHasCover({ coverUrl: "", coverImage: {} }), false);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    authorGroup: "music",
    publicationClass: "practice",
    productKind: "practice",
  })?.code,
  "audio_sprint_class_mismatch",
  "music query with a practice product is not a valid sprint pair",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    authorGroup: "voice",
    publicationClass: "release",
    productKind: "music",
  })?.code,
  "audio_sprint_class_mismatch",
  "voice query with a release is not a valid sprint pair",
);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    authorGroup: "voice",
    publicationClass: "practice",
    productKind: "practice",
  }),
  null,
  "voice query with a practice product passes the packaging gate",
);
assert.equal(
  audioSprintProductMatchesGroup({
    authorGroup: "music",
    publicationClass: null,
    productKind: "music",
  }),
  true,
);
assert.equal(
  audioSprintProductMatchesGroup({
    authorGroup: "music",
    publicationClass: "release",
    productKind: "practice",
  }),
  true,
);
assert.equal(
  audioSprintProductMatchesGroup({
    authorGroup: "voice",
    publicationClass: "practice",
    productKind: "music",
  }),
  false,
);
assert.equal(audioSprintReserveConflictLifecycle("seo_query_already_reserved"), "in_progress");
assert.equal(
  audioSprintReserveConflictLifecycle("seo_query_occupied_by_published_product"),
  "published",
);
assert.equal(audioSprintReserveConflictLifecycle("seo_reservation_limit_reached"), null);
assert.equal(
  evaluateAudioSprintModerationGate({
    ...readySprint,
    isSprintProduct: false,
    isFree: false,
    catalogVisibility: "unlisted",
    isCatalogListed: false,
    title: "Своё название",
    seoTitle: "",
    seoDescription: "",
    subtitle: "",
    description: "",
    usageItems: [],
    faqItems: [],
    coverUrl: "",
    authorGroup: "music",
    publicationClass: "practice",
    productKind: "practice",
  }),
  null,
  "ordinary non-sprint products do not get sprint moderation restrictions",
);

for (const publicationClass of ["course", "audiobook", "post"]) {
  assert.equal(
    isProductCreateSeoDiscoveryEnabled({
      authorId: OTHER,
      publicationClass,
    }),
    false,
    publicationClass,
  );
  assert.equal(
    isSeoReservationProductLinkAllowed({
      authorId: OTHER,
      productKind: publicationClass === "post" ? "audio_post" : "practice",
      publicationClass,
    }),
    false,
    publicationClass,
  );
}
assert.equal(
  isProductCreateSeoDiscoveryEnabled({
    authorId: OTHER,
    publicationClass: "release",
  }),
  true,
);
assert.equal(
  isProductCreateSeoDiscoveryEnabled({
    authorId: OTHER,
    publicationClass: "practice",
  }),
  true,
);

const sprintMigrations = readdirSync(path.join(root, "supabase/migrations")).filter(
  (name) => /audio[-_]?sprint/i.test(name),
);
assert.deepEqual(sprintMigrations, []);
const practiceGate = read(
  "supabase/migrations/20261216120000_seo_reservation_link_practice_gate.sql",
);
assert.match(practiceGate, /publication_class IS DISTINCT FROM 'practice'/);
assert.doesNotMatch(practiceGate, /osen-zvuchit|audio_sprint/);
assert.equal(
  existsSync(
    path.join(root, "supabase/migrations/20261215120000_seo_sprint_autumn_sounds_seed.sql"),
  ),
  true,
);

const sprintLib = read("src/lib/seo-queries/audio-sprint.ts");
assert.match(sprintLib, /export const reservePoolEnabled = false/);
assert.doesNotMatch(sprintLib, /SPRINT_LIMIT|sprintLimit|AUDIO_SPRINT_RESERVATION_LIMIT/);

const client = read("src/components/author-dashboard/AuthorAudioSprintClient.tsx");
assert.match(client, /Забронировать/);
assert.match(client, /Мои запросы:/);
assert.match(client, /SEO_ACTIVE_RESERVATION_LIMIT/);
assert.match(client, /audioSprintPublicationClass/);
assert.match(client, /buildAudioSprintProductCreateHref/);
assert.match(client, /AuthorSeoPromptBuilder/);
assert.match(client, /canReserveAudioSprintQuery/);
assert.match(client, /audioSprintReserveConflictLifecycle/);
assert.match(client, /router\.refresh\(\)/);
assert.match(client, /isAudioSprintPoolVisible/);
assert.match(client, /Музыка|AUDIO_SPRINT_GROUP_LABEL/);
assert.doesNotMatch(client, /publication_class:\s*"course"/);
assert.doesNotMatch(client, /publication_class:\s*"audiobook"/);
assert.doesNotMatch(client, /publication_class:\s*"post"/);
assert.doesNotMatch(client, /Резерв/);

const page = read(
  "src/app/(platform)/author-dashboard/audio-sprints/[slug]/page.tsx",
);
assert.match(page, /listAudioSprintForAuthor/);
assert.match(page, /AuthorDashboardNav/);
assert.match(page, /AUDIO_SPRINT_OSEN_ZVUCHIT_TITLE/);

const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
const seoAt = nav.indexOf("href: `/author-dashboard/seo-opportunities");
const sprintAt = nav.indexOf("href: audioSprintHref");
const statsAt = nav.indexOf("href: `/author-dashboard/stats");
assert.ok(seoAt >= 0 && sprintAt > seoAt && statsAt > sprintAt);
assert.match(nav, /Осень звучит/);
assert.doesNotMatch(nav, /isAuthorSeoDiscoveryEnabled\(authorId\)[\s\S]{0,180}Осень звучит/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /audioSprintTitleLock/);
assert.match(form, /readOnly=\{Boolean\(audioSprintTitleLock\)\}/);
assert.match(form, /function applyAudioSprintTitleLock/);
assert.match(form, /if \(!sprintTitle\) return form/);
assert.match(form, /title: sprintTitle/);
assert.doesNotMatch(form, /seo_about: sprintAbout/);
assert.doesNotMatch(form, /Подробнее о продукте/);
assert.doesNotMatch(form, /seo_about: form\.seoAbout/);
assert.match(form, /seo_reservation_id: seoReservationContext\.reservationId/);
assert.match(
  form,
  /buildProductSavePayload\(\s*formForSave,\s*slugLocked,\s*canConfigureAppreciation,\s*\)/,
);

const createRoute = read("src/app/api/author/products/route.ts");
assert.match(createRoute, /evaluateAudioSprintTitleSave/);
assert.match(createRoute, /seo_reservation_id/);
assert.match(createRoute, /publicationClass: classification\.value\.publicationClass/);
assert.match(createRoute, /productKind: classification\.value\.productKind/);
const patchRoute = read("src/app/api/author/products/[id]/route.ts");
assert.match(patchRoute, /evaluateAudioSprintTitleSave/);
assert.match(patchRoute, /resolveAudioSprintTitleConstraint/);
const submitRoute = read(
  "src/app/api/author/products/[id]/submit-for-moderation/route.ts",
);
assert.match(submitRoute, /evaluateAudioSprintModerationGate/);
assert.match(submitRoute, /loadAudioSprintModerationQuery/);
assert.match(submitRoute, /isCatalogListed: detail\.practice\.is_catalog_listed === true/);
assert.match(submitRoute, /usageItems: detail\.seo_content\.usageItems/);
assert.match(submitRoute, /faqItems: detail\.seo_content\.faqItems/);
assert.match(submitRoute, /authorGroup: sprintQuery\.authorGroup/);
assert.doesNotMatch(submitRoute, /seo_about|seoAbout/);

const list = read("src/lib/seo-queries/list-audio-sprint-queries.ts");
assert.match(list, /audioSprintEnabledPools\(\)/);
assert.match(list, /author_group/);
assert.match(list, /audioSprintProductMatchesGroup/);
assert.match(list, /publication_class, product_kind/);
assert.match(list, /lifecycleForSeoOpportunity/);
assert.match(list, /isEffectiveSeoReservation/);
assert.match(list, /createServiceRoleClient/);
assert.match(list, /expire_seo_query_reservation/);
assert.doesNotMatch(list, /\.update\(|\.insert\(/);

assert.doesNotMatch(read("src/lib/seo-queries/discovery-beta.ts"), /osen-zvuchit|audioSprint/);
assert.doesNotMatch(
  read("src/lib/seo-queries/reservation-product-link-gate.ts"),
  /osen-zvuchit|audioSprint/,
);
assert.doesNotMatch(
  read("src/app/api/author/seo-reservations/route.ts"),
  /osen-zvuchit|audioSprint/,
);
assert.match(
  read("src/lib/seo-queries/reservation-product-link-gate.ts"),
  /publicationClass === "practice"/,
);

const newPage = read("src/app/(platform)/author-dashboard/products/new/page.tsx");
const editPage = read("src/app/(platform)/author-dashboard/products/[id]/page.tsx");
assert.match(newPage, /loadEnabledAudioSprintQueryText/);
assert.match(newPage, /publicationClassToLegacyKind\(publicationClass\)/);
assert.match(newPage, /audioSprintTitleLock/);
assert.match(editPage, /loadEnabledAudioSprintQueryText/);
assert.match(editPage, /product\.practice\.publication_class/);
assert.match(editPage, /product\.practice\.product_kind/);
assert.match(editPage, /audioSprintTitleLock/);
assert.doesNotMatch(sprintLib, /seoAbout/);

console.log("audio-sprint-osen-zvuchit-unit: ok");
