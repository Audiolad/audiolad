import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { rolesGrantPermission } from "../src/lib/auth/platform-permissions";
import { isPrivateRoute } from "../src/lib/auth/routes";
import { evaluateClassicaChecklist } from "../src/lib/classica/production/checklist";
import { formatRubMinor, parseRublesInput } from "../src/lib/classica/production/money";
import {
  CLASSICA_REVIEW_PLACEHOLDER,
  guardClassicaPackagingDraft,
  parseClassicaPackagingDraft,
  type ClassicaPackagingFacts,
} from "../src/lib/classica/production/packaging";
import { isClassicaSlug, slugifyClassicaName } from "../src/lib/classica/production/slug";
import {
  moscowPeriodRange,
  summarizeClassicaOperatorStats,
} from "../src/lib/classica/production/stats";
import {
  canEditClassicaCard,
  classicaPackagingCooldownActive,
  evaluateClassicaTake,
  classicaStatusLabel,
} from "../src/lib/classica/production/status";
import {
  classicaAssetAllowsMime,
  classicaAssetMaxBytes,
  classicaPublishCleanupPaths,
} from "../src/lib/classica/production/files";
import {
  buildClassicaWorkCanonical,
  buildClassicaWorkJsonLd,
  type ClassicaPublicWork,
} from "../src/lib/classica/public/metadata";
import { SEO_ROBOTS_DISALLOWED_PATHS } from "../src/lib/seo/robots-config";

const sql = readFileSync(
  new URL("../supabase/migrations/20261220123000_classica_production_v01.sql", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(
  new URL("../src/lib/classica/production/actions.ts", import.meta.url),
  "utf8",
);
const promptFormSource = readFileSync(
  new URL("../src/components/classica/ClassicaPromptForm.tsx", import.meta.url),
  "utf8",
);

assert.equal(rolesGrantPermission(["admin"], "classica.production.admin"), true);
assert.equal(rolesGrantPermission(["admin"], "classica.production.operate"), true);
assert.equal(rolesGrantPermission(["admin"], "classica.production.moderate"), true);
assert.equal(rolesGrantPermission(["owner"], "classica.production.publish"), true);
assert.equal(rolesGrantPermission(["classica_operator"], "classica.production.operate"), true);
assert.equal(rolesGrantPermission(["classica_operator"], "classica.production.moderate"), false);
assert.equal(rolesGrantPermission(["classica_operator"], "classica.production.admin"), false);
assert.equal(rolesGrantPermission(["classica_moderator"], "classica.production.moderate"), true);
assert.equal(rolesGrantPermission(["classica_moderator"], "classica.production.operate"), false);
assert.equal(rolesGrantPermission(["editor"], "classica.production.access"), false);

assert.equal(isPrivateRoute("/classica/production"), true);
assert.equal(isPrivateRoute("/classica/production/job"), true);
assert.equal(isPrivateRoute("/classica"), false);
assert.equal(isPrivateRoute("/classica/bach/toccata"), false);
assert.equal(SEO_ROBOTS_DISALLOWED_PATHS.includes("/classica/production/"), true);

assert.equal(classicaStatusLabel("queued"), "В очереди");
assert.equal(classicaStatusLabel("published"), "Опубликовано");
assert.deepEqual(
  evaluateClassicaTake({ status: "queued", assigneeId: null, actorCanOperate: true }),
  { ok: true },
);
assert.equal(
  evaluateClassicaTake({ status: "queued", assigneeId: "user", actorCanOperate: true }).ok,
  false,
);
assert.equal(
  evaluateClassicaTake({ status: "in_progress", assigneeId: null, actorCanOperate: true }).ok,
  false,
);
assert.equal(canEditClassicaCard("published", { isAssignee: true, isAdmin: true }), false);
assert.equal(canEditClassicaCard("queued", { isAssignee: false, isAdmin: true }), true);
assert.equal(canEditClassicaCard("in_progress", { isAssignee: true, isAdmin: false }), true);
assert.equal(canEditClassicaCard("in_review", { isAssignee: true, isAdmin: false }), false);

const ready = evaluateClassicaChecklist({
  hasFinalAudio: true,
  audioPlaybackConfirmed: true,
  durationSeconds: 180,
  composerName: "Иоганн Себастьян Бах",
  title: "Токката и фуга ре минор",
  scoreSource: "IMSLP",
  rightsChecked: true,
  seoTitle: "Токката и фуга ре минор Баха",
  seoDescription: "Слушать токкату и фугу ре минор.",
  body: "Короткий текст страницы достаточной длины для проверки.",
  hasCover: true,
  slug: "toccata-and-fugue",
});
assert.equal(ready.ready, true);

const blocked = evaluateClassicaChecklist({
  ...{
    hasFinalAudio: true,
    audioPlaybackConfirmed: false,
    durationSeconds: null,
    composerName: "Бах",
    title: "Токката",
    scoreSource: "IMSLP",
    rightsChecked: false,
    seoTitle: CLASSICA_REVIEW_PLACEHOLDER,
    seoDescription: "Описание",
    body: CLASSICA_REVIEW_PLACEHOLDER,
    hasCover: false,
    slug: "Not A Slug",
  },
});
assert.equal(blocked.ready, false);
assert.ok(blocked.gaps.includes("playback"));
assert.ok(blocked.gaps.includes("rights"));
assert.ok(blocked.gaps.includes("cover"));
assert.ok(blocked.gaps.includes("slug"));
assert.ok(blocked.gaps.includes("seo_title"));
assert.ok(blocked.gaps.includes("body"));

assert.equal(slugifyClassicaName("Иоганн Себастьян Бах"), "iogann-sebastyan-bah");
assert.equal(isClassicaSlug("toccata-and-fugue"), true);
assert.equal(isClassicaSlug("Токката"), false);
assert.equal(parseRublesInput("0"), 0);
assert.equal(parseRublesInput("150"), 15000);
assert.equal(parseRublesInput("-1"), null);
assert.equal(formatRubMinor(0), "0 ₽");

const facts: ClassicaPackagingFacts = {
  composer: "Иоганн Себастьян Бах",
  title: "Токката и фуга ре минор",
  alternativeTitle: null,
  catalogueSystem: "BWV",
  catalogueNumber: "BWV 565",
  musicalKey: "ре минор",
  movement: null,
  year: null,
  primaryQuery: "токката и фуга бах",
  extraQueries: [],
  scoreSource: "IMSLP",
  sourceType: "pdf",
  rightsChecked: true,
  durationSeconds: 540,
};
const invented = parseClassicaPackagingDraft({
  heading: { text: "Токката", doubtful: false, note: "" },
  subtitle: { text: "Для органа", doubtful: false, note: "" },
  short_description: { text: "Пьеса для органа.", doubtful: false, note: "" },
  body: { text: "Бах написал её в 1708 году.", doubtful: false, note: "" },
  about_work: { text: "Каталог BWV 999 не подтверждён.", doubtful: false, note: "" },
  about_composer: { text: "Композитор эпохи барокко.", doubtful: true, note: "нет биографии во входе" },
  listening_notes: { text: "Слушайте вступление.", doubtful: false, note: "" },
  seo_title: { text: "Токката и фуга Баха", doubtful: false, note: "" },
  seo_description: { text: "Слушать токкату и фугу.", doubtful: false, note: "" },
});
assert.ok(invented);
const guarded = guardClassicaPackagingDraft(invented, facts);
assert.equal(guarded.draft.body.text, CLASSICA_REVIEW_PLACEHOLDER);
assert.equal(guarded.flags.body, true);
assert.equal(guarded.draft.about_work.text, CLASSICA_REVIEW_PLACEHOLDER);
assert.equal(guarded.draft.heading.text, "Токката");
assert.equal(guarded.flags.about_composer, true);

const now = new Date("2026-10-03T12:00:00.000Z");
assert.equal(moscowPeriodRange("today", now).from.toISOString(), "2026-10-02T21:00:00.000Z");
assert.equal(moscowPeriodRange("week", now).from.toISOString(), "2026-09-27T21:00:00.000Z");
assert.equal(moscowPeriodRange("month", now).from.toISOString(), "2026-09-30T21:00:00.000Z");

const operatorId = "operator-1";
const stats = summarizeClassicaOperatorStats(
  operatorId,
  [
    { action: "taken", actorId: operatorId, operatorId: null, returnCount: null, createdAt: "2026-10-03T08:00:00.000Z" },
    { action: "submitted", actorId: operatorId, operatorId: null, returnCount: null, createdAt: "2026-10-03T09:00:00.000Z" },
    { action: "accepted", actorId: "moderator", operatorId, returnCount: 0, createdAt: "2026-10-03T10:00:00.000Z" },
    { action: "returned", actorId: "moderator", operatorId, returnCount: 1, createdAt: "2026-09-01T10:00:00.000Z" },
  ],
  [{ operatorId, amountMinor: 0, createdAt: "2026-10-03T10:00:00.000Z", status: "accrued" }],
  moscowPeriodRange("today", now).from,
  now,
);
assert.deepEqual(stats, {
  taken: 1,
  submitted: 1,
  accepted: 1,
  acceptedFirstTry: 1,
  returned: 0,
  accruedMinor: 0,
});

assert.equal(classicaAssetAllowsMime("cover", "image/svg+xml"), false);
assert.equal(classicaAssetAllowsMime("final_audio", "audio/mpeg"), true);
assert.equal(classicaAssetMaxBytes("cover") < classicaAssetMaxBytes("final_audio"), true);

assert.match(sql, /FOR UPDATE/);
assert.match(sql, /classica_already_reserved/);
assert.match(sql, /classica_operator/);
assert.match(sql, /classica_moderator/);
for (const status of [
  "queued",
  "in_progress",
  "audio_ready",
  "packaging_ready",
  "in_review",
  "needs_revision",
  "accepted",
  "published",
]) {
  assert.match(sql, new RegExp(`'${status}'`));
}

const work: ClassicaPublicWork = {
  id: "11111111-1111-4111-8111-111111111111",
  composerSlug: "bach",
  workSlug: "toccata-and-fugue",
  composerName: "Иоганн Себастьян Бах",
  title: "Токката и фуга ре минор",
  heading: "Токката и фуга ре минор",
  subtitle: null,
  shortDescription: "Пьеса для органа.",
  body: "Текст страницы.",
  aboutWork: "О произведении.",
  aboutComposer: "О композиторе.",
  listeningNotes: "Слушайте вступление.",
  faq: [],
  extraBlocks: [],
  seoTitle: "Токката и фуга ре минор — Бах",
  seoDescription: "Слушать токкату и фугу ре минор.",
  musicalKey: "ре минор",
  catalogueNumber: "BWV 565",
  compositionYear: null,
  durationSeconds: 540,
  audioUrl: "https://audiolad.ru/storage/v1/object/public/classica-public/audio.mp3",
  coverUrl: "https://audiolad.ru/storage/v1/object/public/classica-public/cover.jpg",
  coverAlt: "Обложка",
  images: [],
  publishedAt: "2026-10-03T00:00:00.000Z",
};
assert.equal(
  buildClassicaWorkCanonical(work),
  "https://audiolad.ru/classica/bach/toccata-and-fugue",
);
const jsonLd = buildClassicaWorkJsonLd(work);
assert.equal(jsonLd?.["@type"], "MusicComposition");
assert.match(String(jsonLd?.url), /\/classica\/bach\/toccata-and-fugue$/);
const audio = jsonLd?.audio as { contentUrl?: string };
assert.match(String(audio.contentUrl), /^https:\/\/audiolad\.ru\/classica\/media\//);
assert.doesNotMatch(String(audio.contentUrl), /supabase|token=/);

function sqlPolicy(name: string): string {
  const match = sql.match(new RegExp(`CREATE POLICY ${name}\\b[\\s\\S]*?;`));
  assert.ok(match, `missing policy ${name}`);
  return match[0];
}

for (const name of [
  "classica_production_storage_insert",
  "classica_production_storage_update",
  "classica_production_storage_delete",
]) {
  const policy = sqlPolicy(name);
  assert.match(policy, /classica_production_storage_can_write\(name\)/);
  assert.doesNotMatch(policy, /classica\.production\.operate/);
  assert.doesNotMatch(policy, /classica\.production\.admin/);
}
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.classica_production_storage_can_write\(p_name text\)/);
assert.match(sql, /split_part\(p_name, '\/', 1\)/);
assert.match(sql, /classica_production_actor_can_edit\(job, auth\.uid\(\)\)/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.classica_production_storage_can_write\(text\) TO authenticated/);

const promptsPolicy = sqlPolicy("classica_production_prompts_select");
assert.match(promptsPolicy, /classica\.production\.admin/);
assert.doesNotMatch(promptsPolicy, /classica\.production\.access/);

const accrualsPolicy = sqlPolicy("classica_production_accruals_select");
assert.match(
  accrualsPolicy,
  /classica\.production\.admin[\s\S]*OR[\s\S]*classica\.production\.access[\s\S]*operator_id = auth\.uid\(\)/,
);

assert.doesNotMatch(sql, /UPDATE\s+public\.classical_composers/);
assert.match(sql, /INSERT INTO public\.classical_composers/);

const preparedAt = "2026-10-03T11:59:00.000Z";
assert.equal(classicaPackagingCooldownActive(null, now), false);
assert.equal(classicaPackagingCooldownActive("not-a-date", now), false);
assert.equal(classicaPackagingCooldownActive(preparedAt, now), true);
assert.equal(classicaPackagingCooldownActive("2026-10-03T11:57:00.000Z", now), false);

assert.deepEqual(
  classicaPublishCleanupPaths([
    { path: "works/job/audio/existing.mp3", existedBefore: true },
    { path: "works/job/cover/new.jpg", existedBefore: false },
  ]),
  ["works/job/cover/new.jpg"],
);

const packagingSource = actionsSource.slice(
  actionsSource.indexOf("export async function prepareClassicaPackagingAction"),
  actionsSource.indexOf("export async function publishClassicaJobAction"),
);
const openAiCall = packagingSource.indexOf("prepareClassicaPackaging(");
assert.ok(openAiCall > packagingSource.indexOf("canEditClassicaCard("));
assert.ok(openAiCall > packagingSource.indexOf("classicaPackagingCooldownActive("));
assert.ok(openAiCall > packagingSource.indexOf("createServiceRoleClient("));
assert.equal(packagingSource.includes("getClassicaMasterPrompt(supabase)"), false);
assert.equal(packagingSource.includes("getClassicaMasterPrompt(session.supabase)"), false);

const publishSource = actionsSource.slice(
  actionsSource.indexOf("export async function publishClassicaJobAction"),
  actionsSource.indexOf("export async function saveClassicaPromptAction"),
);
assert.match(publishSource, /classicaPublishCleanupPaths\(copiedThisAttempt\)/);
assert.ok(publishSource.indexOf("classica_production_publish") < publishSource.lastIndexOf("removeFilesCopiedThisAttempt"));
assert.match(publishSource, /upsert: false/);

assert.doesNotMatch(promptFormSource, /["']use client["']/);
assert.doesNotMatch(promptFormSource, /useActionState/);

console.log("classica production unit ok");
