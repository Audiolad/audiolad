/**
 * Regression: author input must survive audio upload / «аудио обрабатывается» poll.
 *
 * Bug (audio posts, voice memos m4a/wav/aac and Telegram OGG): the first audio
 * upload creates the draft with only the title, the upload enqueues a normalize
 * job (audio_prepare_status=queued), and the form polled every 3 s with a full
 * reloadSavedProduct() that rebuilt the form and topics from the saved draft.
 * Unsaved subtitle, description, format, topics, SEO fields were wiped.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyServerAudioPrepareStatus,
  mergeServerAudioItems,
  mergeServerProductIntoForm,
  productDetailToFormSnapshot,
  type ProductFormSnapshot,
} from "../src/lib/author-products/form-merge";
import type {
  AudioItemRow,
  AuthorProductDetail,
} from "../src/lib/author-products/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

const PRACTICE_ID = "11111111-1111-4111-8111-111111111111";
const AUDIO_ID = "44444444-4444-4444-8444-444444444444";

function audioItem(overrides: Partial<AudioItemRow> = {}): AudioItemRow {
  return {
    id: AUDIO_ID,
    practice_id: PRACTICE_ID,
    title: "Аудио 1",
    description: null,
    audio_path: null,
    duration_seconds: null,
    position: 1,
    original_file_name: null,
    file_size_bytes: null,
    status: "draft",
    created_at: "2026-10-29T10:00:00.000Z",
    updated_at: "2026-10-29T10:00:00.000Z",
    audio_prepare_status: null,
    ...overrides,
  } as AudioItemRow;
}

/** What the server has right after the first upload: only the title was saved. */
function serverDraft(
  items: AudioItemRow[],
  overrides: Record<string, unknown> = {},
): AuthorProductDetail {
  return {
    practice: {
      id: PRACTICE_ID,
      author_id: "22222222-2222-4222-8222-222222222222",
      title: "Утренний голос",
      slug: "utrenniy-golos",
      subtitle: null,
      description: null,
      format: null,
      product_kind: "audio_post",
      publication_class: "audio_post",
      music_usage_permission: null,
      duration_minutes: null,
      price: 0,
      is_free: true,
      is_catalog_listed: true,
      catalog_visibility: "listed",
      cover_url: null,
      use_shared_cover: true,
      audio_url: null,
      status: "draft",
      moderation_status: "not_submitted",
      moderation_attempt: 0,
      moderation_submitted_at: null,
      moderation_review_comment: null,
      deleted_at: null,
      currency: "RUB",
      published_at: null,
      scheduled_publish_at: null,
      listening_notice_enabled: true,
      listening_notice_title: null,
      listening_notice_text: null,
      promo_enabled: false,
      seo_primary_query: null,
      seo_title: null,
      seo_description: null,
      seo_about: null,
      author_recommendations_title: null,
      created_at: "2026-10-29T10:00:00.000Z",
      updated_at: "2026-10-29T10:00:05.000Z",
      ...overrides,
    },
    audio_items: items,
    gallery_slides: [],
    seo_content: { usageItems: [], faqItems: [], relatedPracticeIds: [], relatedListenSlugs: [] },
    contentLockedAfterSale: false,
    deleteLockedAfterPaidPurchase: false,
  } as unknown as AuthorProductDetail;
}

// The author filled everything before choosing the file.
const typedForm: ProductFormSnapshot = {
  ...productDetailToFormSnapshot(serverDraft([])),
  subtitle: "Короткая мысль на день",
  description: "Подробное описание аудиопоста, которое автор набрал вручную.",
  formatPreset: "Эфир",
  customFormat: "",
  slug: "moy-slug",
  seoTitle: "SEO заголовок",
  seoDescription: "SEO описание",
  seoAbout: "О чём пост",
  listeningNoticeTitle: "Как слушать",
  listeningNoticeText: "Лучше в наушниках",
  promoEnabled: true,
  promoTitle: "Промо",
  promoText: "Текст промо",
};

// 1) Old behaviour, documented: rebuilding from the saved draft loses input.
const rebuilt = productDetailToFormSnapshot(serverDraft([]));
assert.equal(rebuilt.title, "Утренний голос", "title was saved at draft create");
assert.equal(rebuilt.description, "", "full rebuild drops unsaved description");
assert.equal(rebuilt.subtitle, "", "full rebuild drops unsaved subtitle");

// 2) Upload response merge keeps every locally edited field.
const queuedServerItem = audioItem({
  original_file_name: "voice.ogg",
  file_size_bytes: 12345,
  audio_prepare_status: "queued",
});
const afterUpload = mergeServerProductIntoForm(
  typedForm,
  serverDraft([queuedServerItem]),
);
for (const key of [
  "title",
  "subtitle",
  "description",
  "formatPreset",
  "customFormat",
  "slug",
  "seoTitle",
  "seoDescription",
  "seoAbout",
  "listeningNoticeTitle",
  "listeningNoticeText",
  "promoEnabled",
  "promoTitle",
  "promoText",
] as const) {
  assert.deepEqual(afterUpload[key], typedForm[key], `upload merge keeps ${key}`);
}
assert.equal(
  mergeServerProductIntoForm({ ...typedForm, slug: "" }, serverDraft([])).slug,
  "utrenniy-golos",
  "empty local slug takes the server slug",
);
assert.equal(
  mergeServerProductIntoForm(typedForm, serverDraft([], { status: "draft", moderation_status: "rejected" }))
    .moderationStatus,
  "rejected",
  "server-owned moderation status still refreshes",
);

// 3) Poll tick: only file/prepare fields change; local text and rows stay.
const localItems = [
  audioItem({ title: "Мой трек", description: "Описание трека" }),
  audioItem({ id: "temp-2", title: "Новый ряд", position: 2 }),
];
const tick1 = applyServerAudioPrepareStatus(localItems, [queuedServerItem]);
assert.equal(tick1[0].audio_prepare_status, "queued");
assert.equal(tick1[0].title, "Мой трек");
assert.equal(tick1[0].description, "Описание трека");
assert.equal(tick1.length, 2, "local-only rows are not dropped by the poll");
assert.equal(tick1[1].id, "temp-2");
assert.equal(
  applyServerAudioPrepareStatus(tick1, [queuedServerItem]),
  tick1,
  "unchanged poll tick keeps the same array (no effect churn)",
);
const readyServerItem = audioItem({
  title: "server title",
  description: "server description",
  audio_path: `practices/${PRACTICE_ID}/audio/${AUDIO_ID}.mp3`,
  duration_seconds: 61,
  original_file_name: "voice.ogg",
  file_size_bytes: 12345,
  audio_prepare_status: null,
  updated_at: "2026-10-29T10:01:00.000Z",
});
const tick2 = applyServerAudioPrepareStatus(tick1, [readyServerItem]);
assert.equal(tick2[0].audio_prepare_status, null);
assert.equal(tick2[0].audio_path, readyServerItem.audio_path);
assert.equal(tick2[0].duration_seconds, 61);
assert.equal(tick2[0].title, "Мой трек");
assert.equal(tick2[0].description, "Описание трека");
assert.equal(tick2[1], tick1[1]);

// mergeServerAudioItems (upload response) keeps local track text too.
const mergedItems = mergeServerAudioItems(localItems, [readyServerItem]);
assert.equal(mergedItems[0].title, "Мой трек");
assert.equal(mergedItems[0].description, "Описание трека");

// 4) Wiring guards in the form component.
const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
const pollStart = formSource.indexOf(
  "isAudioPrepareInFlight(item.audio_prepare_status),",
);
assert.ok(pollStart > 0, "prepare poll effect exists");
const pollBlock = formSource.slice(pollStart, formSource.indexOf("}, [audioItems", pollStart));
assert.match(pollBlock, /refreshAudioPrepareStatus\(practiceId\)/);
assert.doesNotMatch(
  pollBlock,
  /reloadSavedProduct\(/,
  "prepare poll must not rebuild the form from the saved draft",
);
assert.match(pollBlock, /applyServerAudioPrepareStatus\(current, product\.audio_items\)/);
assert.doesNotMatch(pollBlock, /setForm\(|setTopicKeys\(|applyTopicFormData\(/);

const uploadFn = formSource.slice(
  formSource.indexOf("async function uploadAudio("),
  formSource.indexOf("async function deleteAudioFile("),
);
assert.doesNotMatch(uploadFn, /reloadSavedProduct\(/, "upload never rebuilds the form");
assert.match(uploadFn, /refreshProductPreservingDraft\(id\)/);
assert.match(uploadFn, /applyServerProductPreservingDraft\(result\.product\)/);

const launchFn = formSource.slice(
  formSource.indexOf("async function launchMusicUpload("),
  formSource.indexOf("musicLaunchRef.current ="),
);
assert.doesNotMatch(launchFn, /reloadSavedProduct\(/);

// Save failures before topics are synced keep the author's topic selection.
assert.equal(
  (formSource.match(/reloadSavedProduct\(id, \{ keepLocalTopics: true \}\)/g) ?? []).length,
  2,
);
assert.match(
  formSource,
  /if \(options\.keepLocalTopics\) \{[\s\S]*?setTopicOptions[\s\S]*?\} else \{\s*await applyTopicFormData/,
);

// Cover uploads merge too (product cover and per-track cover).
assert.match(
  formSource,
  /function handleProductCoverUpdated[\s\S]*?applyServerProductPreservingDraft\(product\)/,
);

// OGG (PR #1077) file names become clean audio titles.
assert.match(formSource, /\\\.\(mp3\|wav\|m4a\|aac\|ogg\|oga\|opus\)\$\/i/);

console.log("author-product-upload-preserves-draft-unit: ok");
