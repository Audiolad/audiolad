#!/usr/bin/env node
/**
 * Listener impressions: text, privacy, spam, pagination, author reply,
 * moderation and separation from star ratings.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AUTHOR_UNREAD_CARD_CLASS,
  AUTHOR_UNREAD_CIRCLE_CLASS,
  AUTHOR_UNREAD_PILL_CLASS,
  AuthorUnreadCommentBadgeView,
} from "../src/components/author-dashboard/AuthorUnreadCommentBadge";
import * as ListenerCommentComposerModule from "../src/components/products/practice-page/ListenerCommentComposer";
import * as ListenerImpressionAvatarModule from "../src/components/products/practice-page/ListenerImpressionAvatar";
import {
  LISTENER_VIEWER_AVATAR_PATH,
  listenerAvatarColor,
  listenerAvatarLetter,
  listenerAvatarPresentation,
  resolveViewerCommentAvatar,
  sanitizePublicAvatarUrl,
} from "../src/lib/practice-comments/avatar";
import { openListenerCommentAvatar } from "../src/lib/practice-comments/avatar-proxy";
import { isListenerCommentFeedVisible } from "../src/lib/practice-comments/visibility";

import { resolveListenerCommentComposer } from "../src/lib/practice-comments/composer";
import {
  hashCommentId,
  LISTENER_COMMENT_HASH_PAGE_CAP,
  shouldLoadAnotherCommentPage,
} from "../src/lib/practice-comments/deep-link";
import {
  LISTENER_IMPRESSION_EMOJIS,
  LISTENER_IMPRESSION_INVITE,
  LISTENER_IMPRESSION_LOAD_MORE,
  LISTENER_IMPRESSION_PLACEHOLDER,
  LISTENER_IMPRESSION_SIGN_IN,
  LISTENER_IMPRESSION_SUBMIT,
  moderationActorLabel,
  moderationJournalReasonLabel,
  MODERATION_ACTION_LABELS,
  ownerReturnConfirm,
  REPORT_REASON_LABELS,
} from "../src/lib/practice-comments/copy";
import {
  createMemoryCommentStore,
  memoryId,
  type MemoryCommentState,
} from "../src/lib/practice-comments/memory-store";
import { decodeCommentCursor, encodeCommentCursor } from "../src/lib/practice-comments/pagination";
import {
  COMMENT_CREATE_LIMIT,
  COMMENT_EDIT_LIMIT,
  COMMENT_REPLY_LIMIT,
  countUnreadAuthorImpressions,
  createImpression,
  deleteCommentAsOwner,
  deleteOwnComment,
  listAuthorFeedback,
  listListenerNotices,
  markAuthorImpressionNotices,
  listModerationQueue,
  listPracticeComments,
  moderateComment,
  replyAsAuthor,
  reportComment,
  returnCommentAsOwner,
  updateOwnComment,
} from "../src/lib/practice-comments/service";
import type { CommentNoticeRow, ListenerCommentRow } from "../src/lib/practice-comments/types";
import {
  commentFingerprint,
  deriveDefaultPublicName,
  insertImpressionEmoji,
  parseCommentBody,
} from "../src/lib/practice-comments/text";
import { CATALOG_PUBLICATION_CLASSES } from "../src/lib/catalog/dto";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind";
import {
  LISTENER_COMMENT_PRODUCT_SURFACES,
  practiceAcceptsListenerComments,
  type ListenerCommentPracticeGate,
} from "../src/lib/practice-comments/policy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const practiceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const listener = "11111111-1111-4111-8111-111111111111";
const authorUser = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const moderator = "44444444-4444-4444-8444-444444444444";

function gate(overrides: Partial<ListenerCommentPracticeGate> = {}): ListenerCommentPracticeGate {
  return {
    practiceId,
    authorId: "55555555-5555-4555-8555-555555555555",
    title: "Тихая практика",
    authorSlug: "anna",
    productSlug: "tihaya",
    authorName: "Анна Светлая",
    productKind: "practice",
    catalogSection: "meditations",
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
    scheduledPublishAt: null,
    deletedAt: null,
    catalogVisibility: "listed",
    ...overrides,
  };
}

function state(extra: Partial<MemoryCommentState> = {}): MemoryCommentState {
  return {
    gates: [gate()],
    memberships: [{ userId: authorUser, practiceId, authorId: gate().authorId }],
    names: { [listener]: "Мария" },
    authorNames: { [practiceId]: "Анна Светлая" },
    comments: [],
    notices: [],
    reports: [],
    events: [],
    edits: [],
    ...extra,
  };
}

function isoSeconds(seconds: number): string {
  return new Date(Date.UTC(2026, 8, 1, 0, 0, seconds)).toISOString();
}

function commentUuid(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function impressionRow(
  id: string,
  createdAt: string,
  body: string,
  status: "published" | "hidden" = "published",
): ListenerCommentRow {
  return {
    id,
    practiceId,
    userId: listener,
    parentId: null,
    kind: "impression",
    body,
    publicName: "Мария",
    status,
    clientRequestId: null,
    bodyFingerprint: body,
    hiddenReason: status === "hidden" ? "spam" : null,
    createdAt,
    updatedAt: createdAt,
    editedAt: null,
    deletedAt: null,
  };
}

function clock(limited = false) {
  return {
    now: () => new Date("2026-10-26T08:00:00.000Z"),
    rateLimit: () => !limited,
  };
}

const actor = (userId: string | null, isModerator = false, isPlatformOwner = false) => ({
  userId,
  isModerator,
  isPlatformOwner,
});
const ownerUser = "99999999-9999-4999-8999-999999999991";

async function testPrivacyAndXss() {
  assert.equal(deriveDefaultPublicName("Мария Петрова"), "Мария Петрова");
  assert.equal(deriveDefaultPublicName("Сергей"), "Сергей");
  assert.equal(deriveDefaultPublicName("Сергей Александрович Петров"), "Сергей Петров");
  assert.equal(deriveDefaultPublicName("maria@example.com"), "Слушатель");
  assert.equal(deriveDefaultPublicName("Мария petrov@mail.ru"), "Мария");
  assert.equal(parseCommentBody("<script>alert(1)</script>").ok, false);
  assert.equal(parseCommentBody('"><img src=x onerror=alert(1)>').ok, false);
  assert.equal(parseCommentBody("стало спокойнее").ok, true);
  const withEmoji = parseCommentBody("Стало спокойнее ❤️ 🕊️");
  assert.equal(withEmoji.ok, true);
  if (withEmoji.ok) assert.equal(withEmoji.value, "Стало спокойнее ❤️ 🕊️");
  const dove = "🕊️";
  const inserted = insertImpressionEmoji({
    body: "Спокойно",
    emoji: dove,
    selectionStart: 8,
    selectionEnd: 8,
    maxLength: 2000,
  });
  assert.deepEqual(inserted, { body: `Спокойно${dove}`, caret: 8 + dove.length });
  assert.equal(
    insertImpressionEmoji({
      body: "абв",
      emoji: "🔥",
      selectionStart: 1,
      selectionEnd: 2,
      maxLength: 2000,
    })?.body,
    "а🔥в",
  );
  assert.equal(
    insertImpressionEmoji({
      body: "я".repeat(2000),
      emoji: "❤️",
      selectionStart: 2000,
      selectionEnd: 2000,
      maxLength: 2000,
    }),
    null,
  );
  assert.equal(commentFingerprint("  Стало   спокойнее "), "стало спокойнее");
  assert.doesNotMatch(LISTENER_IMPRESSION_INVITE, /дискомфорт|лечен|гарант|терап|исцел/i);
  assert.match(LISTENER_IMPRESSION_INVITE, /–/);
  assert.doesNotMatch(LISTENER_IMPRESSION_INVITE, /—/);
  const impressionsCopy = read("src/lib/practice-comments/copy.ts");
  assert.match(impressionsCopy, /export const LISTENER_IMPRESSIONS_TITLE = "Впечатления"/);
  assert.doesNotMatch(impressionsCopy, /LISTENER_IMPRESSION_PRIVACY/);
  assert.doesNotMatch(impressionsCopy, /Отзыв виден на странице продукта/);
  assert.doesNotMatch(impressionsCopy, /Публикуется имя из поля/);
  assert.doesNotMatch(impressionsCopy, /Его можно сократить перед публикацией/);
  assert.doesNotMatch(impressionsCopy, /Почта не показывается/);
  assert.doesNotMatch(impressionsCopy, /Поделитесь впечатлением от прослушивания/);
  assert.doesNotMatch(impressionsCopy, /Это по желанию и ни на что не влияет/);
  assert.equal(MODERATION_ACTION_LABELS.hide, "Скрыт");
  assert.equal(MODERATION_ACTION_LABELS.report, "Жалоба");
  assert.equal(REPORT_REASON_LABELS.spam, "Спам");
}

async function testCreateListEditDelete() {
  const store = createMemoryCommentStore(state());
  const created = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Стало спокойнее",
    publicName: "",
    clientRequestId: "55555555-5555-4555-8555-555555555551",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.replayed, false);
  assert.equal(created.comment.publicName, "Мария");
  assert.equal("userId" in created.comment, false);
  assert.equal(created.comment.body.includes("<"), false);

  const replay = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Стало спокойнее",
    publicName: "Мария",
    clientRequestId: "55555555-5555-4555-8555-555555555551",
  });
  assert.equal(replay.ok && replay.replayed, true);

  const duplicate = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Стало спокойнее",
    publicName: "Мария",
    clientRequestId: "55555555-5555-4555-8555-555555555552",
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error, "duplicate_comment");

  const guest = await createImpression(store, actor(null), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Гость",
    publicName: "Гость",
    clientRequestId: null,
  });
  assert.equal(guest.ok, false);
  if (!guest.ok) assert.equal(guest.status, 401);

  const edited = await updateOwnComment(store, actor(listener), clock(), {
    commentId: created.comment.id,
    body: "Заметила тишину",
  });
  assert.equal(edited.ok && edited.comment.body, "Заметила тишину");

  const stolen = await updateOwnComment(store, actor(other), clock(), {
    commentId: created.comment.id,
    body: "Чужой текст",
  });
  assert.equal(stolen.ok, false);
  if (!stolen.ok) assert.equal(stolen.status, 403);

  const removed = await deleteOwnComment(store, actor(listener), clock(), created.comment.id);
  assert.equal(removed.ok, true);
  const after = await listPracticeComments(store, actor(other), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(after.ok && after.comments.length, 0);
}

async function testProductGatesAndRatingsIsolation() {
  const music = createMemoryCommentStore(
    state({ gates: [gate({ productKind: "music", catalogSection: "music", productSlug: "track" })] }),
  );
  const musicWrite = await createImpression(music, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "track",
    body: "Про музыку",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(musicWrite.ok, true);

  const post = createMemoryCommentStore(
    state({ gates: [gate({ productKind: "audio_post", productSlug: "post" })] }),
  );
  const postWrite = await createImpression(post, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "post",
    body: "Про пост",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(postWrite.ok, true);

  assert.equal(
    practiceAcceptsListenerComments({
      productKind: "practice",
      catalogSection: "meditations",
      status: "draft",
    }),
    false,
  );
  assert.equal(
    practiceAcceptsListenerComments({
      productKind: "practice",
      catalogSection: null,
      catalogVisibility: "listed",
      status: "published",
    }),
    true,
  );
  assert.equal(
    practiceAcceptsListenerComments({
      productKind: "practice",
      catalogSection: "music",
      catalogVisibility: "unlisted",
      status: "published",
      publishedAt: "2026-08-16T00:00:00.000Z",
    }),
    true,
    "a practice on the music shelf is still commentable",
  );
  assert.equal(
    practiceAcceptsListenerComments({
      productKind: null,
      catalogSection: "music",
      catalogVisibility: "listed",
      status: "published",
    }),
    true,
  );
  assert.equal(
    practiceAcceptsListenerComments({
      productKind: "music",
      catalogSection: "music",
      catalogVisibility: "selected_users",
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
    }),
    false,
    "a private product does not accept public comments",
  );
  assert.equal(
    practiceAcceptsListenerComments({
      productKind: "practice",
      catalogSection: "meditations",
      catalogVisibility: "listed",
      status: "published",
      publishedAt: null,
      scheduledPublishAt: "2099-01-01T00:00:00.000Z",
      now: new Date("2026-01-01T00:00:00.000Z"),
    }),
    false,
  );
  const shelfPractice = createMemoryCommentStore(
    state({
      gates: [
        gate({
          catalogSection: "music",
          productSlug: "potok",
          title: "Поток денег",
        }),
      ],
    }),
  );
  const shelfWrite = await createImpression(shelfPractice, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "potok",
    body: "Отзыв к практике на музыкальной полке",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(shelfWrite.ok, true);
  const shelfFollowUp = read(
    "supabase/migrations/20270124150000_listener_comments_by_product_type.sql",
  );
  assert.match(shelfFollowUp, /COALESCE\(p\.product_kind, 'practice'\) = 'practice'/);
  assert.doesNotMatch(shelfFollowUp, /catalog_section <> 'music'/);
  const allKinds = read("supabase/migrations/20270126120000_listener_comments_all_product_kinds.sql");
  const allKindsSql = allKinds
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(allKindsSql, /product_kind/);
  assert.doesNotMatch(allKindsSql, /catalog_section/);
  assert.match(allKindsSql, /p\.status = 'published'/);
  assert.match(allKindsSql, /catalog_visibility IN \('listed', 'unlisted'\)/);
  assert.match(allKindsSql, /owner_delete/);
  assert.match(allKindsSql, /owner_return/);
  const privacySql = read(
    "supabase/migrations/20270127120000_listener_comments_public_visibility_owner_tx.sql",
  );
  assert.match(privacySql, /catalog_visibility IN \('listed', 'unlisted'\)/);
  assert.match(privacySql, /practice_listener_comment_owner_delete/);
  assert.match(privacySql, /practice_listener_comment_owner_return/);
  assert.match(privacySql, /DELETE FROM public\.practice_listener_comment_notices/);
  assert.match(privacySql, /OWNER APPROVAL REQUIRED/);
  assert.doesNotMatch(
    privacySql,
    /DELETE FROM public\.practices|DELETE FROM public\.practice_listener_comments|UPDATE public\.practices/,
  );
  const visibilitySmoke = read("supabase/tests/practice_listener_comments_all_kinds_smoke.sql");
  assert.match(visibilitySmoke, /selected_users/);
  assert.match(visibilitySmoke, /scheduled_publish_at/);
  assert.match(visibilitySmoke, /not a practice/);
  assert.match(read("scripts/lib/practice-listener-comments-stub.sql"), /catalog_visibility text/);
  assert.match(read("supabase/tests/practice_listener_comments_owner_tx_smoke.sql"), /restore hidden/);
  assert.doesNotMatch(allKindsSql, /UPDATE public\.practices|INSERT INTO public\.practices|DELETE FROM/);
  assert.match(allKinds, /OWNER APPROVAL REQUIRED/);

  const migration = read("supabase/migrations/20270124140000_practice_listener_comments.sql");
  const migrationSql = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const service = read("src/lib/practice-comments/service.ts");
  assert.doesNotMatch(
    migrationSql,
    /ALTER TABLE public\.practice_ratings|INSERT INTO public\.practice_ratings|UPDATE public\.practice_ratings|DELETE FROM public\.practice_ratings|ALTER TABLE public\.practices|DROP TABLE/,
  );
  assert.doesNotMatch(service, /practice_ratings|ratings\/write|applyOwnPracticeRating/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.practice_listener_comment_feed TO anon, authenticated, service_role/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.practice_listener_comments FROM anon/);
  assert.doesNotMatch(migration, /GRANT SELECT \(user_id\)|user_id text/);
  assert.match(read("src/components/products/practice-page/PracticeComments.tsx"), /\{comment\.body\}/);
  assert.doesNotMatch(read("src/components/products/practice-page/PracticeComments.tsx"), /dangerouslySetInnerHTML/);
  assert.doesNotMatch(read("src/lib/practice-comments/supabase-store.ts"), /select\("id, email|full_name, email/);
}

async function testSpamPaginationAndAuthorReply() {
  const current = state();
  const store = createMemoryCommentStore(current);
  const ids = [
    "66666666-6666-4666-8666-666666666661",
    "66666666-6666-4666-8666-666666666662",
    "66666666-6666-4666-8666-666666666663",
  ];
  for (const [index, requestId] of ids.entries()) {
    const created = await createImpression(store, actor(listener), clock(), {
      authorSlug: "anna",
      productSlug: "tihaya",
      body: `Впечатление номер ${index + 1}`,
      publicName: "Мария",
      clientRequestId: requestId,
    });
    assert.equal(created.ok, true);
    current.comments[index]!.createdAt = `2026-10-26T08:00:0${index}.000Z`;
  }
  const page = await listPracticeComments(store, actor(other), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 2,
  });
  assert.equal(page.ok, true);
  if (!page.ok) return;
  assert.equal(page.comments.length, 2);
  assert.equal(page.comments[0]?.body, "Впечатление номер 3");
  assert.ok(page.nextCursor);
  const next = await listPracticeComments(store, actor(other), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: { createdAt: page.comments[1]!.createdAt, id: page.comments[1]!.id },
    limit: 2,
  });
  assert.equal(next.ok && next.comments.length, 1);
  assert.equal(encodeCommentCursor(page.comments[1]!).length > 10, true);

  const limited = await createImpression(store, actor(listener), clock(true), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Ещё одно впечатление",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(limited.ok, false);
  if (!limited.ok) assert.equal(limited.error, "rate_limited");

  const authorDelete = await deleteOwnComment(store, actor(authorUser), clock(), page.comments[0]!.id);
  assert.equal(authorDelete.ok, false);
  if (!authorDelete.ok) assert.equal(authorDelete.error, "author_cannot_delete_impression");

  const reply = await replyAsAuthor(store, actor(authorUser), clock(), {
    commentId: page.comments[0]!.id,
    body: "Спасибо, что поделились",
    clientRequestId: "77777777-7777-4777-8777-777777777771",
  });
  assert.equal(reply.ok, true);
  if (!reply.ok) return;
  assert.equal(reply.comment.reply?.publicName, "Анна Светлая");
  assert.equal(reply.comment.reply?.body, "Спасибо, что поделились");
  assert.equal(reply.comment.mine, false);
  assert.equal(reply.comment.reply?.mine, true);

  const stranger = await replyAsAuthor(store, actor(other), clock(), {
    commentId: page.comments[0]!.id,
    body: "Не автор",
    clientRequestId: null,
  });
  assert.equal(stranger.ok, false);

  const notices = await listListenerNotices(store, actor(listener));
  assert.equal(notices.ok && notices.notices.length, 1);
  const cabinet = await listAuthorFeedback(store, actor(authorUser), {
    authorId: gate().authorId,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(cabinet.ok && cabinet.comments.length, 3);
  if (cabinet.ok) {
    assert.equal(cabinet.comments.some((item) => item.unread), true);
    assert.equal(JSON.stringify(cabinet).includes("full_name"), false);
    assert.equal(JSON.stringify(cabinet).includes("@"), false);
  }
}

async function testReportModeration() {
  const store = createMemoryCommentStore(state());
  const created = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Личный телефон 123 не должен жить публично",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const report = await reportComment(store, actor(other), clock(), {
    commentId: created.comment.id,
    reason: "personal_data",
    details: "номер телефона",
  });
  assert.equal(report.ok, true);
  const again = await reportComment(store, actor(other), clock(), {
    commentId: created.comment.id,
    reason: "spam",
    details: null,
  });
  assert.equal(again.ok && again.duplicate, true);
  const authorHide = await moderateComment(store, actor(authorUser), clock(), {
    commentId: created.comment.id,
    action: "hide",
    reason: "spam",
  });
  assert.equal(authorHide.ok, false);
  const hidden = await moderateComment(store, actor(moderator, true), clock(), {
    commentId: created.comment.id,
    action: "hide",
    reason: "personal_data",
  });
  assert.equal(hidden.ok, true);
  const publicList = await listPracticeComments(store, actor(other), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(publicList.ok && publicList.comments.length, 0);
  const ownList = await listPracticeComments(store, actor(listener), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(ownList.ok && ownList.comments[0]?.status, "hidden");
  const queue = await listModerationQueue(store, actor(moderator, true), {
    queue: "hidden",
    cursor: null,
    limit: 10,
  });
  assert.equal(queue.ok && queue.items.length, 1);
  if (queue.ok) {
    assert.equal(JSON.stringify(queue.items[0]).includes("reporterUserId"), false);
    assert.equal(queue.items[0]?.journal.some((event) => event.action === "hide"), true);
    assert.equal(queue.items[0]?.journal.some((event) => event.action === "report"), true);
  }
  const strangerQueue = await listModerationQueue(store, actor(listener), {
    queue: "hidden",
    cursor: null,
    limit: 10,
  });
  assert.equal(strangerQueue.ok, false);
  const restored = await moderateComment(store, actor(moderator, true), clock(), {
    commentId: created.comment.id,
    action: "restore",
    reason: "уточнили",
  });
  assert.equal(restored.ok, false);
  if (!restored.ok) assert.equal(restored.status, 403);
  const stillHidden = await listPracticeComments(store, actor(listener), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(stillHidden.ok && stillHidden.comments[0]?.status, "hidden");
}

async function testEmptyAndPlayerCopy() {
  const store = createMemoryCommentStore(state());
  const empty = await listPracticeComments(store, actor(null), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "old",
    cursor: null,
    limit: 10,
  });
  assert.equal(empty.ok && empty.comments.length, 0);
  assert.equal(empty.ok && empty.viewer.canComment, false);
  const player = read("src/components/audio/ListenPlayerMobile.tsx");
  assert.match(player, /Начать заново/);
  assert.match(player, /ListenerImpressionInvite/);
  assert.match(player, /session\.listenerImpressionHref/);
  const migration = read("supabase/migrations/20270124140000_practice_listener_comments.sql");
  assert.match(migration, /No email or SMS is sent from this table/);
  assert.equal(memoryId().length, 36);
}

async function testModerationQueuePagesPastTwentyOne() {
  const unreported = Array.from({ length: 21 }, (_, index) =>
    impressionRow(commentUuid("88888888", index + 1), isoSeconds(100 + index), `Новый отзыв ${index + 1}`),
  );
  const older = impressionRow(commentUuid("88888888", 90), isoSeconds(1), "Старый отзыв с жалобой");
  const sparse = createMemoryCommentStore(
    state({
      comments: [...unreported, older],
      reports: [
        {
          id: commentUuid("99999999", 1),
          commentId: older.id,
          reporterUserId: other,
          reason: "spam",
          details: null,
          createdAt: older.createdAt,
        },
      ],
    }),
  );
  const sparsePage = await listModerationQueue(sparse, actor(moderator, true), {
    queue: "reports",
    cursor: null,
    limit: 20,
  });
  assert.equal(sparsePage.ok, true);
  if (!sparsePage.ok) return;
  assert.equal(sparsePage.items.length, 1);
  assert.equal(sparsePage.items[0]?.id, older.id);
  assert.equal(sparsePage.nextCursor, null);

  const reported = Array.from({ length: 22 }, (_, index) =>
    impressionRow(commentUuid("77777777", index + 1), isoSeconds(index + 1), `Жалоба ${index + 1}`),
  );
  const paged = createMemoryCommentStore(
    state({
      comments: reported,
      reports: reported.map((row, index) => ({
        id: commentUuid("66666666", index + 1),
        commentId: row.id,
        reporterUserId: other,
        reason: "spam" as const,
        details: null,
        createdAt: row.createdAt,
      })),
    }),
  );
  const first = await listModerationQueue(paged, actor(moderator, true), {
    queue: "reports",
    cursor: null,
    limit: 20,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.items.length, 20);
  assert.equal(first.items[0]?.body, "Жалоба 22");
  assert.ok(first.nextCursor);
  const cursor = decodeCommentCursor(first.nextCursor);
  assert.ok(cursor);
  const second = await listModerationQueue(paged, actor(moderator, true), {
    queue: "reports",
    cursor,
    limit: 20,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.items.length, 2);
  assert.equal(second.items[0]?.body, "Жалоба 2");
  assert.equal(second.items[1]?.body, "Жалоба 1");
  assert.equal(second.nextCursor, null);

  const hidden = Array.from({ length: 22 }, (_, index) =>
    impressionRow(commentUuid("55555555", index + 1), isoSeconds(index + 1), `Скрытый ${index + 1}`, "hidden"),
  );
  const hiddenStore = createMemoryCommentStore(state({ comments: hidden }));
  const hiddenPage = await listModerationQueue(hiddenStore, actor(moderator, true), {
    queue: "hidden",
    cursor: null,
    limit: 20,
  });
  assert.equal(hiddenPage.ok, true);
  if (!hiddenPage.ok) return;
  assert.equal(hiddenPage.items.length, 20);
  assert.ok(hiddenPage.nextCursor);
}

async function testEditAndReplyRateLimits() {
  const blockedStore = createMemoryCommentStore(state());
  const blockedCreated = await createImpression(blockedStore, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Стало спокойнее",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(blockedCreated.ok, true);
  if (!blockedCreated.ok) return;
  const blockedEdit = await updateOwnComment(blockedStore, actor(listener), clock(true), {
    commentId: blockedCreated.comment.id,
    body: "Другая спокойная фраза",
  });
  assert.equal(blockedEdit.ok, false);
  if (!blockedEdit.ok) assert.equal(blockedEdit.error, "rate_limited");

  const store = createMemoryCommentStore(state());
  const created = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Стало спокойнее",
    publicName: "Мария",
    clientRequestId: "55555555-5555-4555-8555-555555555561",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  for (let n = 1; n <= COMMENT_EDIT_LIMIT; n += 1) {
    const edited = await updateOwnComment(store, actor(listener), clock(), {
      commentId: created.comment.id,
      body: `Спокойная фраза номер ${n}`,
    });
    assert.equal(edited.ok, true);
    if (edited.ok) assert.equal(edited.comment.mine, true);
  }
  const overflow = await updateOwnComment(store, actor(listener), clock(), {
    commentId: created.comment.id,
    body: "Ещё одна спокойная фраза",
  });
  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.equal(overflow.error, "rate_limited");

  const parents = Array.from({ length: COMMENT_REPLY_LIMIT + 1 }, (_, index) =>
    impressionRow(commentUuid("12121212", index + 1), isoSeconds(index + 1), `Отзыв для ответа ${index + 1}`),
  );
  const replyStore = createMemoryCommentStore(state({ comments: parents }));
  for (let n = 0; n < COMMENT_REPLY_LIMIT; n += 1) {
    const replied = await replyAsAuthor(replyStore, actor(authorUser), clock(), {
      commentId: parents[n]!.id,
      body: `Спасибо за отзыв ${n + 1}`,
      clientRequestId: null,
    });
    assert.equal(replied.ok, true);
    if (replied.ok) assert.equal(replied.comment.mine, false);
  }
  const tooMany = await replyAsAuthor(replyStore, actor(authorUser), clock(), {
    commentId: parents[COMMENT_REPLY_LIMIT]!.id,
    body: "Спасибо, что написали ещё",
    clientRequestId: null,
  });
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.equal(tooMany.error, "rate_limited");

  const burstStore = createMemoryCommentStore(state());
  const burst = await Promise.all(
    Array.from({ length: COMMENT_CREATE_LIMIT + 4 }, (_, index) =>
      createImpression(burstStore, actor(listener), clock(), {
        authorSlug: "anna",
        productSlug: "tihaya",
        body: `Спокойное впечатление ${index + 1}`,
        publicName: "Мария",
        clientRequestId: null,
      }),
    ),
  );
  assert.equal(burst.filter((item) => item.ok).length, COMMENT_CREATE_LIMIT);
  for (const item of burst) {
    if (!item.ok) assert.equal(item.error, "rate_limited");
  }
}

function componentExport<Props>(module: { default: unknown }): ComponentType<Props> {
  let value: unknown = module.default;
  while (value && typeof value === "object" && "default" in value) {
    value = (value as { default: unknown }).default;
  }
  if (typeof value !== "function") {
    throw new Error("component export is not a function");
  }
  return value as ComponentType<Props>;
}

async function testSignedInListenerSeesComposer() {
  const store = createMemoryCommentStore(state());
  const stranger = "66666666-6666-4666-8666-666666666666";
  const signedIn = await listPracticeComments(store, actor(stranger), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(signedIn.ok, true);
  if (!signedIn.ok) return;
  assert.equal(signedIn.viewer.authenticated, true);
  assert.equal(signedIn.viewer.canComment, true);
  const created = await createImpression(store, actor(stranger), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Тихий вечер после практики",
    publicName: "Олег",
    clientRequestId: null,
  });
  assert.equal(created.ok, true, "a signed-in listener needs no purchase to review a practice");

  const guestPayload = resolveListenerCommentComposer({
    isAuthenticated: true,
    viewerCanComment: false,
    viewerAuthenticated: false,
  });
  assert.equal(guestPayload, "form");
  assert.equal(
    resolveListenerCommentComposer({
      isAuthenticated: false,
      viewerCanComment: false,
      viewerAuthenticated: false,
    }),
    "sign_in",
  );

  const Composer = componentExport<Record<string, unknown>>(ListenerCommentComposerModule);
  const signInHref = "/auth/sign-in?next=%2Fpractice%2Fanna%2Ftihaya";
  const formMarkup = renderToStaticMarkup(
    createElement(Composer, {
      mode: "form",
      publicName: "Сергей",
      avatarUrl: LISTENER_VIEWER_AVATAR_PATH,
      body: "",
      pending: false,
      formError: null,
      signInHref,
      errorMessage: null,
      onPublicNameChange: () => undefined,
      onBodyChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  assert.match(formMarkup, /data-listener-comment-composer="form"/);
  assert.match(formMarkup, /data-listener-comment-preview="avatar"/);
  assert.match(formMarkup, new RegExp(`src="${LISTENER_VIEWER_AVATAR_PATH}"`));
  assert.match(formMarkup, new RegExp(LISTENER_IMPRESSION_SUBMIT));
  assert.match(formMarkup, /id="listener-impression-body"/);
  assert.equal(
    LISTENER_IMPRESSION_PLACEHOLDER,
    "Что вы почувствовали, заметили, ощутили, когда слушали",
  );
  assert.match(formMarkup, /placeholder="Что вы почувствовали, заметили, ощутили, когда слушали"/);
  assert.doesNotMatch(formMarkup, /Что вы заметили, пока слушали/);
  assert.doesNotMatch(read("src/lib/practice-comments/copy.ts"), /Что вы заметили, пока слушали/);
  assert.doesNotMatch(formMarkup, /Оценки гостей/);
  assert.doesNotMatch(formMarkup, /—/);
  assert.equal(LISTENER_IMPRESSION_EMOJIS.length, 5);
  for (const item of LISTENER_IMPRESSION_EMOJIS) {
    assert.match(formMarkup, new RegExp(`aria-label="${item.label}"`));
    assert.match(formMarkup, new RegExp(`data-listener-impression-emoji="${item.label}"`));
    assert.ok(formMarkup.includes(item.emoji));
  }
  assert.match(formMarkup, /type="button"/);

  const letterMarkup = renderToStaticMarkup(
    createElement(Composer, {
      mode: "form",
      publicName: "Сергей Петров",
      avatarUrl: null,
      body: "",
      pending: false,
      formError: null,
      signInHref,
      errorMessage: null,
      onPublicNameChange: () => undefined,
      onBodyChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  assert.match(letterMarkup, /data-listener-comment-preview="avatar"/);
  assert.match(letterMarkup, /role="img"/);
  assert.match(letterMarkup, /value="Сергей Петров"/);
  assert.match(letterMarkup, />С</);
  assert.doesNotMatch(letterMarkup, /<img /);

  const guestMarkup = renderToStaticMarkup(
    createElement(Composer, {
      mode: "sign_in",
      publicName: "",
      avatarUrl: null,
      body: "",
      pending: false,
      formError: null,
      signInHref,
      errorMessage: null,
      onPublicNameChange: () => undefined,
      onBodyChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  assert.match(guestMarkup, /data-listener-comment-composer="sign_in"/);
  assert.ok(guestMarkup.includes(LISTENER_IMPRESSION_SIGN_IN));
  assert.ok(guestMarkup.includes(`href="${signInHref}"`));
  assert.doesNotMatch(guestMarkup, /data-listener-comment-composer="form"/);
  assert.doesNotMatch(guestMarkup, /data-listener-impression-emoji/);
  assert.doesNotMatch(guestMarkup, /—/);

  assert.equal(
    resolveListenerCommentComposer({
      isAuthenticated: true,
      hasOwnImpression: true,
    }),
    "hidden",
  );
  assert.equal(
    resolveListenerCommentComposer({
      isAuthenticated: false,
      viewerAuthenticated: false,
      hasOwnImpression: true,
    }),
    "sign_in",
  );
  const hiddenMarkup = renderToStaticMarkup(
    createElement(Composer, {
      mode: "hidden",
      publicName: "Сергей Петров",
      avatarUrl: null,
      body: "",
      pending: false,
      formError: null,
      signInHref,
      errorMessage: null,
      onPublicNameChange: () => undefined,
      onBodyChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  assert.equal(hiddenMarkup, "");

  const newer = Array.from({ length: 11 }, (_, index) => ({
    ...impressionRow(commentUuid("99999999", index + 1), isoSeconds(20 + index), `Чужой отзыв ${index}`),
    userId: other,
    publicName: "Олег",
  }));
  const own = impressionRow(commentUuid("99999999", 40), isoSeconds(1), "Мой тихий вечер");
  const paged = createMemoryCommentStore(state({ comments: [own, ...newer] }));
  const firstPage = await listPracticeComments(paged, actor(listener), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(firstPage.ok, true);
  if (!firstPage.ok) return;
  assert.equal(firstPage.comments.some((item) => item.id === own.id), false);
  assert.equal(firstPage.viewer.hasOwnImpression, true);
  assert.equal(firstPage.comments.every((item) => item.mine === false), true);
  const strangerPage = await listPracticeComments(paged, actor(moderator), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(strangerPage.ok, true);
  if (!strangerPage.ok) return;
  assert.equal(strangerPage.viewer.hasOwnImpression, false);
  const guestPage = await listPracticeComments(paged, actor(null), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(guestPage.ok, true);
  if (!guestPage.ok) return;
  assert.equal(guestPage.viewer.hasOwnImpression, false);

  const removed = await deleteOwnComment(paged, actor(listener), clock(), own.id);
  assert.equal(removed.ok, true);
  const afterDelete = await listPracticeComments(paged, actor(listener), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(afterDelete.ok, true);
  if (!afterDelete.ok) return;
  assert.equal(afterDelete.viewer.hasOwnImpression, false);

  const emojiStore = createMemoryCommentStore(state());
  const emojiSaved = await createImpression(emojiStore, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Стало спокойнее ❤️ 🕊️",
    publicName: "Мария Петрова",
    clientRequestId: null,
  });
  assert.equal(emojiSaved.ok, true);
  if (emojiSaved.ok) {
    assert.equal(emojiSaved.comment.body, "Стало спокойнее ❤️ 🕊️");
    assert.equal(emojiSaved.comment.publicName, "Мария Петрова");
    assert.equal(JSON.stringify(emojiSaved.comment).includes("❤️"), true);
    assert.equal(JSON.stringify(emojiSaved.comment).includes("🕊️"), true);
  }

  const route = read("src/app/api/listen/product/[slug]/[productSlug]/comments/route.ts");
  const server = read("src/lib/practice-comments/server.ts");
  const commentsUi = read("src/components/products/practice-page/PracticeComments.tsx");
  const stars = read("src/components/products/practice-page/PracticeRatingStars.tsx");
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(server, /Cache-Control": "private, no-store"/);
  assert.match(server, /Vary: "Cookie"/);
  assert.match(commentsUi, /cache: "no-store"/);
  assert.match(commentsUi, /resolveListenerCommentComposer/);
  assert.match(commentsUi, /avatarUrl=\{viewer\?\.avatarUrl \?\? null\}/);
  assert.match(commentsUi, /hasOwnImpression/);
  assert.match(commentsUi, /comment\.mine/);
  assert.match(read("src/components/products/practice-page/ListenerCommentComposer.tsx"), /mode === "hidden"/);
  assert.match(read("src/lib/practice-comments/supabase-store.ts"), /listener_comment_own_lookup_failed/);
  assert.doesNotMatch(commentsUi, /data-listener-impression-privacy/);
  assert.doesNotMatch(commentsUi, /LISTENER_IMPRESSION_PRIVACY/);
  assert.doesNotMatch(commentsUi, /Отзыв виден на странице продукта/);
  assert.match(
    commentsUi,
    /\{LISTENER_IMPRESSIONS_TITLE\}[\s\S]{0,500}aria-label="Порядок отзывов"[\s\S]{0,400}\{LISTENER_IMPRESSION_SORT_NEW\}[\s\S]{0,250}\{LISTENER_IMPRESSION_SORT_OLD\}/,
  );
  assert.match(
    read("src/app/(platform)/(listener)/practice/[...segments]/layout.tsx"),
    /min-w-0 max-w-full/,
  );
  assert.doesNotMatch(commentsUi, /viewer\?\.canComment \?/);
  assert.doesNotMatch(stars, /Оценки гостей/);
  assert.doesNotMatch(stars, /data-practice-rating-guest-aggregate/);
}

async function testModeratorScopeAndQueueSource() {
  const restoreRoute = join(root, "src/app/api/admin/listener-comments/[commentId]/restore/route.ts");
  assert.equal(existsSync(restoreRoute), false);
  const service = read("src/lib/practice-comments/service.ts");
  const moderate = service.slice(
    service.indexOf("export async function moderateComment"),
    service.indexOf("export async function listModerationQueue"),
  );
  assert.doesNotMatch(moderate, /status: "published"|action: "restore"/);
  assert.match(service, /insertCommentLimited/);
  assert.match(service, /commitEditLimited/);
  assert.match(service, /insertReportLimited/);
  assert.doesNotMatch(service, /countRecentReplies|countRecentEdits|countRecentReports|countRecentImpressions/);
  assert.doesNotMatch(read("src/lib/practice-comments/types.ts"), /restore/);
  assert.doesNotMatch(read("src/lib/practice-comments/copy.ts"), /restore/);
  assert.doesNotMatch(read("src/lib/practice-comments/supabase-store.ts"), /restore/);
  assert.equal("restore" in MODERATION_ACTION_LABELS, false);
  assert.doesNotMatch(read("src/lib/practice-comments/server.ts"), /_ok/);
  const commentsUi = read("src/components/products/practice-page/PracticeComments.tsx");
  const composerUi = read("src/components/products/practice-page/ListenerCommentComposer.tsx");
  assert.match(commentsUi, /buildAuthRouteHref\("\/auth\/sign-in", signInReturnPath\)/);
  assert.match(commentsUi, /signInHref=\{signInHref\}/);
  assert.match(
    composerUi,
    /role="alert"[\s\S]{0,500}formError === "unauthorized"[\s\S]{0,400}href=\{signInHref\}/,
  );
  assert.match(composerUi, /data-listener-comment-composer="sign_in"/);
  assert.match(composerUi, /href=\{signInHref\}/);
  const panel = read("src/components/admin/AdminListenerCommentsPanel.tsx");
  assert.equal(LISTENER_IMPRESSION_LOAD_MORE, "Показать ещё");
  assert.match(panel, /LISTENER_IMPRESSION_LOAD_MORE/);
  assert.match(panel, /nextCursor/);
  assert.match(panel, /moderationJournalActionLabel/);
  assert.match(panel, /actorLabel/);
  assert.doesNotMatch(panel, /actorUserId/);
  assert.match(panel, /ownerReturnTo/);
  assert.equal(moderationJournalReasonLabel("previous:published"), "Был опубликован");
  assert.equal(moderationJournalReasonLabel("previous:hidden"), "Был скрыт");
  assert.equal(moderationJournalReasonLabel("status:hidden"), "Снова скрыт");
  assert.equal(ownerReturnConfirm("published"), "Вернуть отзыв на страницу?");
  assert.equal(
    ownerReturnConfirm("hidden"),
    "Вернуть отзыв в скрытые? На странице его не будет.",
  );
  assert.equal(moderationActorLabel({ fullName: "Сергей", email: "owner@audiolad.ru" }), "Сергей");
  assert.equal(
    moderationActorLabel({ fullName: ownerUser, email: "sergey@audiolad.ru" }),
    "sergey",
  );
  assert.equal(moderationActorLabel({ fullName: null, email: "a@b.ru?token=secret" }), "Участник");
  assert.equal(MODERATION_ACTION_LABELS.hide, "Скрыт");
  assert.doesNotMatch(panel, /\/restore/);
  assert.doesNotMatch(panel, /\{event\.action\}/);
  const queueFn = read("src/lib/practice-comments/supabase-store.ts").slice(
    read("src/lib/practice-comments/supabase-store.ts").indexOf("async listModerationQueue"),
  );
  assert.match(queueFn, /practice_listener_comment_reports!inner/);
  assert.doesNotMatch(queueFn, /reports\.length > 0/);
  const copy = read("src/lib/practice-comments/copy.ts");
  assert.doesNotMatch(copy, /—/);
  assert.doesNotMatch(copy, /диагноз|дискомфорт|Не указывайте/i);
}

async function testEveryProductSurfaceAndOwnerDelete() {
  const coveredClasses = new Set(
    LISTENER_COMMENT_PRODUCT_SURFACES.map((surface) => surface.publicationClass).filter(
      (value): value is NonNullable<typeof value> => value != null,
    ),
  );
  for (const publicationClass of CATALOG_PUBLICATION_CLASSES) {
    assert.equal(coveredClasses.has(publicationClass), true, publicationClass);
  }
  for (const kind of Object.values(PRODUCT_KIND)) {
    assert.equal(
      LISTENER_COMMENT_PRODUCT_SURFACES.some((surface) => surface.productKind === kind),
      true,
      kind,
    );
  }
  assert.equal(
    LISTENER_COMMENT_PRODUCT_SURFACES.some((surface) => surface.id === "playlist"),
    false,
  );

  for (const surface of LISTENER_COMMENT_PRODUCT_SURFACES) {
    assert.equal(
      practiceAcceptsListenerComments({
        productKind: surface.productKind,
        catalogSection: surface.catalogSection,
        catalogVisibility: "listed",
        status: "published",
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
      true,
      surface.id,
    );
    assert.equal(
      practiceAcceptsListenerComments({
        productKind: surface.productKind,
        catalogSection: surface.catalogSection,
        status: "draft",
      }),
      false,
      `${surface.id} draft`,
    );
    assert.equal(
      practiceAcceptsListenerComments({
        productKind: surface.productKind,
        catalogSection: surface.catalogSection,
        status: "published",
        deletedAt: "2026-02-01T00:00:00.000Z",
      }),
      false,
      `${surface.id} deleted product`,
    );
    const slug = `surface-${surface.id}`;
    const surfaceStore = createMemoryCommentStore(
      state({
        gates: [
          gate({
            productKind: surface.productKind,
            catalogSection: surface.catalogSection,
            productSlug: slug,
            title: surface.label,
          }),
        ],
      }),
    );
    const created = await createImpression(surfaceStore, actor(listener), clock(), {
      authorSlug: "anna",
      productSlug: slug,
      body: `Впечатление: ${surface.label}`,
      publicName: "Мария",
      clientRequestId: null,
    });
    assert.equal(created.ok, true, surface.id);
    const listed = await listPracticeComments(surfaceStore, actor(other), {
      authorSlug: "anna",
      productSlug: slug,
      sort: "new",
      cursor: null,
      limit: 10,
    });
    assert.equal(listed.ok && listed.comments.length, 1, surface.id);
    assert.equal(listed.ok && listed.publishedCount, 1, surface.id);
    assert.equal(listed.ok && listed.viewer.canOwnerDelete, false, surface.id);
  }

  const musicSlug = "owner-track";
  const postSlug = "owner-post";
  const postId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const store = createMemoryCommentStore(
    state({
      gates: [
        gate({
          productKind: "music",
          catalogSection: "music",
          productSlug: musicSlug,
          title: "Трек",
        }),
        gate({
          practiceId: postId,
          productKind: "audio_post",
          productSlug: postSlug,
          title: "Пост",
        }),
      ],
      memberships: [
        { userId: authorUser, practiceId, authorId: gate().authorId },
        { userId: authorUser, practiceId: postId, authorId: gate().authorId },
      ],
    }),
  );
  const created = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: musicSlug,
    body: "Громкая музыка",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const commentId = created.comment.id;

  for (const denied of [actor(listener), actor(authorUser), actor(moderator, true, false)]) {
    const attempt = await deleteCommentAsOwner(store, denied, clock(), commentId);
    assert.equal(attempt.ok, false);
    if (!attempt.ok) assert.equal(attempt.status, 403);
  }
  const guest = await deleteCommentAsOwner(store, actor(null, false, true), clock(), commentId);
  assert.equal(guest.ok, false);
  if (!guest.ok) assert.equal(guest.status, 401);
  const authorOwn = await deleteOwnComment(store, actor(authorUser), clock(), commentId);
  assert.equal(authorOwn.ok, false);
  if (!authorOwn.ok) assert.equal(authorOwn.error, "author_cannot_delete_impression");

  const otherPage = await listPracticeComments(store, actor(other), {
    authorSlug: "anna",
    productSlug: postSlug,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(otherPage.ok && otherPage.publishedCount, 0);

  const removed = await deleteCommentAsOwner(store, actor(ownerUser, false, true), clock(), commentId);
  assert.equal(removed.ok, true);
  const after = await listPracticeComments(store, actor(listener), {
    authorSlug: "anna",
    productSlug: musicSlug,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(after.ok && after.comments.length, 0);
  assert.equal(after.ok && after.publishedCount, 0);
  const ownerView = await listPracticeComments(store, actor(ownerUser, false, true), {
    authorSlug: "anna",
    productSlug: musicSlug,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(ownerView.ok && ownerView.comments.length, 0);
  assert.equal(ownerView.ok && ownerView.viewer.canOwnerDelete, true);
  const stillThere = await listPracticeComments(store, actor(other), {
    authorSlug: "anna",
    productSlug: postSlug,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(stillThere.ok && stillThere.comments.length, 0);

  const cabinet = await listAuthorFeedback(store, actor(authorUser), {
    authorId: gate().authorId,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(cabinet.ok && cabinet.comments.some((item) => item.id === commentId), false);

  const deletedQueueDenied = await listModerationQueue(store, actor(moderator, true, false), {
    queue: "deleted",
    cursor: null,
    limit: 10,
  });
  assert.equal(deletedQueueDenied.ok, false);
  if (!deletedQueueDenied.ok) assert.equal(deletedQueueDenied.status, 403);

  const deletedQueue = await listModerationQueue(store, actor(ownerUser, true, true), {
    queue: "deleted",
    cursor: null,
    limit: 10,
  });
  assert.equal(deletedQueue.ok && deletedQueue.canOwnerDelete, true);
  if (deletedQueue.ok) {
    const item = deletedQueue.items.find((row) => row.id === commentId);
    assert.ok(item);
    assert.equal(item?.journal.some((event) => event.action === "owner_delete" && event.actorUserId === ownerUser), true);
  }

  const strangerReturn = await returnCommentAsOwner(store, actor(moderator, true, false), clock(), commentId);
  assert.equal(strangerReturn.ok, false);
  if (!strangerReturn.ok) assert.equal(strangerReturn.status, 403);
  const returned = await returnCommentAsOwner(store, actor(ownerUser, false, true), clock(), commentId);
  assert.equal(returned.ok, true);
  const back = await listPracticeComments(store, actor(other), {
    authorSlug: "anna",
    productSlug: musicSlug,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(back.ok && back.publishedCount, 1);
  assert.equal(back.ok && back.comments[0]?.body, "Громкая музыка");

  const hiddenSlug = "hidden-return";
  let tick = Date.parse("2026-10-26T09:00:00.000Z");
  const stepping = {
    now: () => new Date(tick),
    rateLimit: () => {
      tick += 1000;
      return true;
    },
  };
  const hiddenState = state({
    gates: [gate({ productSlug: hiddenSlug, title: "Тихий возврат" })],
    profiles: { [ownerUser]: { fullName: "Сергей", email: "sergey@audiolad.ru" } },
  });
  const hiddenStore = createMemoryCommentStore(hiddenState);
  const hiddenCreated = await createImpression(hiddenStore, actor(listener), stepping, {
    authorSlug: "anna",
    productSlug: hiddenSlug,
    body: "Скрытый текст отзыва",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(hiddenCreated.ok, true);
  if (!hiddenCreated.ok) return;
  assert.equal(hiddenState.notices.some((notice) => notice.commentId === hiddenCreated.comment.id), true);
  const hiddenComment = await moderateComment(hiddenStore, actor(moderator, true, false), stepping, {
    commentId: hiddenCreated.comment.id,
    action: "hide",
    reason: "spam",
  });
  assert.equal(hiddenComment.ok, true);
  const hiddenRemoved = await deleteCommentAsOwner(
    hiddenStore,
    actor(ownerUser, false, true),
    stepping,
    hiddenCreated.comment.id,
  );
  assert.equal(hiddenRemoved.ok, true);
  assert.equal(hiddenState.notices.some((notice) => notice.commentId === hiddenCreated.comment.id), false);
  const hiddenDeletedQueue = await listModerationQueue(hiddenStore, actor(ownerUser, true, true), {
    queue: "deleted",
    cursor: null,
    limit: 10,
  });
  if (hiddenDeletedQueue.ok) {
    const item = hiddenDeletedQueue.items.find((row) => row.id === hiddenCreated.comment.id);
    assert.equal(item?.ownerReturnTo, "hidden");
    assert.equal(
      item?.journal.some((event) => event.action === "owner_delete" && event.actorLabel === "Сергей"),
      true,
    );
  } else {
    assert.fail("hidden comment must appear in the deleted queue");
  }
  const hiddenReturned = await returnCommentAsOwner(
    hiddenStore,
    actor(ownerUser, false, true),
    stepping,
    hiddenCreated.comment.id,
  );
  assert.equal(hiddenReturned.ok, true);
  const hiddenPublic = await listPracticeComments(hiddenStore, actor(other), {
    authorSlug: "anna",
    productSlug: hiddenSlug,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(hiddenPublic.ok && hiddenPublic.publishedCount, 0);
  const hiddenQueue = await listModerationQueue(hiddenStore, actor(moderator, true, false), {
    queue: "hidden",
    cursor: null,
    limit: 10,
  });
  assert.equal(
    hiddenQueue.ok && hiddenQueue.items.some((item) => item.id === hiddenCreated.comment.id),
    true,
  );

  const listenerSlug = "listener-retract";
  const listenerState = state({
    gates: [gate({ productSlug: listenerSlug })],
  });
  const listenerStore = createMemoryCommentStore(listenerState);
  const listenerCreated = await createImpression(listenerStore, actor(listener), stepping, {
    authorSlug: "anna",
    productSlug: listenerSlug,
    body: "Свой отзыв слушателя",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(listenerCreated.ok, true);
  if (!listenerCreated.ok) return;
  assert.equal(listenerState.notices.length > 0, true);
  const listenerRemoved = await deleteOwnComment(listenerStore, actor(listener), stepping, listenerCreated.comment.id);
  assert.equal(listenerRemoved.ok, true);
  assert.equal(listenerState.notices.length, 0);
  const listenerReturn = await returnCommentAsOwner(
    listenerStore,
    actor(ownerUser, false, true),
    stepping,
    listenerCreated.comment.id,
  );
  assert.equal(listenerReturn.ok, false);
  if (!listenerReturn.ok) assert.equal(listenerReturn.error, "not_owner_deleted");

  const ownerOwn = await createImpression(listenerStore, actor(ownerUser, false, true), stepping, {
    authorSlug: "anna",
    productSlug: listenerSlug,
    body: "Отзыв владельца",
    publicName: "Сергей",
    clientRequestId: null,
  });
  assert.equal(ownerOwn.ok, true);
  if (!ownerOwn.ok) return;
  const ownerOwnRemoved = await deleteOwnComment(
    listenerStore,
    actor(ownerUser, false, true),
    stepping,
    ownerOwn.comment.id,
  );
  assert.equal(ownerOwnRemoved.ok, true);
  const ownerOwnQueue = await listModerationQueue(listenerStore, actor(ownerUser, true, true), {
    queue: "deleted",
    cursor: null,
    limit: 10,
  });
  assert.equal(
    ownerOwnQueue.ok &&
      ownerOwnQueue.items.some(
        (item) =>
          item.id === ownerOwn.comment.id &&
          item.journal.some((event) => event.action === "owner_delete" && event.reason === "previous:published"),
      ),
    true,
  );

  const privateWrite = await createImpression(
    createMemoryCommentStore(
      state({
        gates: [
          gate({
            productKind: "music",
            catalogSection: "music",
            catalogVisibility: "selected_users",
            productSlug: "private-track",
          }),
        ],
      }),
    ),
    actor(listener),
    stepping,
    {
      authorSlug: "anna",
      productSlug: "private-track",
      body: "Закрытый продукт",
      publicName: "Мария",
      clientRequestId: null,
    },
  );
  assert.equal(privateWrite.ok, false);
  if (!privateWrite.ok) assert.equal(privateWrite.status, 404);

  const page = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");
  assert.doesNotMatch(page, /listenerCommentsEnabled:\s*!isAudioPost/);
  assert.match(page, /listenerCommentsEnabled: practiceAcceptsListenerComments/);
  assert.match(page, /catalogVisibility: practice\.catalog_visibility/);
  assert.match(
    read("src/lib/listen/load-session-payload.ts"),
    /catalogVisibility: practiceRow\.catalog_visibility/,
  );
  assert.match(
    read("src/lib/practice-comments/supabase-store.ts"),
    /catalogVisibility: practice\.catalog_visibility \?\? null/,
  );
  const ownerService = read("src/lib/practice-comments/service.ts");
  const ownerDeleteFn = ownerService.slice(
    ownerService.indexOf("export async function deleteCommentAsOwner"),
    ownerService.indexOf("export async function returnCommentAsOwner"),
  );
  assert.match(ownerDeleteFn, /applyOwnerModeration/);
  assert.doesNotMatch(ownerDeleteFn, /updateComment\(/);
  const ownerReturnFn = ownerService.slice(ownerService.indexOf("export async function returnCommentAsOwner"));
  assert.match(ownerReturnFn, /applyOwnerModeration/);
  assert.doesNotMatch(ownerReturnFn, /previous:hidden \? "hidden" : "published"/);
  assert.match(read("src/lib/practice-comments/service.ts"), /isPlatformOwner === true/);
  assert.doesNotMatch(
    read("src/components/products/practice-page/PracticeComments.tsx"),
    /canOwnerDelete && !comment\.mine/,
  );
  assert.match(read("src/components/products/practice-page/PracticePageContent.tsx"), /<PracticeComments/);
  const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");
  assert.match(audioPost, /<PracticeComments/);
  assert.match(audioPost, /viewModel\.listenerCommentsEnabled/);
  assert.equal((audioPost.match(/<PracticeComments/g) || []).length, 1);
  const ownerDeleteRoute = read("src/app/api/admin/listener-comments/[commentId]/owner-delete/route.ts");
  assert.match(ownerDeleteRoute, /commentPlatformOwner/);
  assert.match(ownerDeleteRoute, /deleteCommentAsOwner/);
  assert.doesNotMatch(ownerDeleteRoute, /commentModerator/);
  const ownerReturnRoute = read("src/app/api/admin/listener-comments/[commentId]/owner-return/route.ts");
  assert.match(ownerReturnRoute, /commentPlatformOwner/);
  assert.match(ownerReturnRoute, /returnCommentAsOwner/);
  assert.match(read("src/components/products/practice-page/PracticeComments.tsx"), /data-owner-delete-comment="true"/);
  assert.match(read("src/components/admin/AdminListenerCommentsPanel.tsx"), /data-owner-delete-comment="true"/);
  assert.match(read("src/components/admin/AdminListenerCommentsPanel.tsx"), /data-owner-return-comment="true"/);
  assert.doesNotMatch(read("src/lib/practice-comments/service.ts"), /practice_ratings/);
}

async function testAvatars() {
  const listenerId = listener;
  assert.equal(listenerAvatarLetter("Мария"), "М");
  assert.equal(listenerAvatarLetter("  анна"), "А");
  assert.equal(listenerAvatarLetter(""), "С");
  assert.equal(listenerAvatarLetter("   "), "С");
  assert.equal(listenerAvatarColor("Мария"), listenerAvatarColor("мария"));
  assert.match(listenerAvatarColor("Мария"), /^#[0-9a-f]{6}$/);

  const safe = "https://cdn.example/pictures/maria.webp";
  assert.equal(sanitizePublicAvatarUrl(safe), safe);
  assert.equal(
    sanitizePublicAvatarUrl(`https://cdn.example/${listenerId}/photo.webp`, { userId: listenerId }),
    null,
  );
  assert.equal(sanitizePublicAvatarUrl("https://olga@cdn.example/a.webp"), null);
  assert.equal(sanitizePublicAvatarUrl("https://cdn.example/a.webp?token=secret"), null);
  assert.equal(sanitizePublicAvatarUrl("http://cdn.example/a.webp"), null);
  assert.equal(
    sanitizePublicAvatarUrl("https://cdn.example/Петрова.webp", { fullName: "Мария Петрова" }),
    null,
  );
  assert.equal(
    sanitizePublicAvatarUrl("https://cdn.example/%D0%9F%D0%B5%D1%82%D1%80%D0%BE%D0%B2%D0%B0.webp", {
      fullName: "Мария Петрова",
    }),
    null,
  );
  const proxyId = commentUuid("99999999", 7);
  const proxy = `/api/listener-comment-avatars/${proxyId}`;
  assert.equal(sanitizePublicAvatarUrl(proxy), proxy);
  assert.equal(proxy.includes(listenerId), false);
  assert.equal(sanitizePublicAvatarUrl(LISTENER_VIEWER_AVATAR_PATH), LISTENER_VIEWER_AVATAR_PATH);
  assert.equal(sanitizePublicAvatarUrl(`${LISTENER_VIEWER_AVATAR_PATH}?token=secret`), null);
  assert.equal(
    resolveViewerCommentAvatar({
      userId: listenerId,
      profileUrl: safe,
      profileFullName: "Мария Петрова",
    }),
    safe,
  );
  assert.equal(
    resolveViewerCommentAvatar({
      userId: listenerId,
      profileUrl: `https://cdn.example/sign/${listenerId}/photo.webp?token=secret`,
      profilePath: `${listenerId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`,
      profileFullName: "Мария Петрова",
    }),
    LISTENER_VIEWER_AVATAR_PATH,
  );
  assert.equal(
    resolveViewerCommentAvatar({ userId: listenerId, profileUrl: null, profilePath: null }),
    null,
  );

  const shown = listenerAvatarPresentation({ name: "Мария", url: safe, imageFailed: false });
  assert.equal(shown.kind, "image");
  if (shown.kind === "image") assert.equal(shown.alt, "Аватар: Мария");
  const broken = listenerAvatarPresentation({ name: "Мария", url: safe, imageFailed: true });
  assert.equal(broken.kind, "letter");
  if (broken.kind === "letter") {
    assert.equal(broken.letter, "М");
    assert.equal(broken.color, listenerAvatarColor("Мария"));
    assert.equal(broken.label, "Аватар: Мария");
  }
  const absent = listenerAvatarPresentation({ name: "Мария", url: null, imageFailed: false });
  assert.equal(absent.kind, "letter");
  if (absent.kind === "letter") assert.equal(absent.letter, "М");

  let avatarExport: unknown = ListenerImpressionAvatarModule.default;
  while (avatarExport && typeof avatarExport === "object" && "default" in avatarExport) {
    avatarExport = (avatarExport as { default: unknown }).default;
  }
  if (typeof avatarExport !== "function") {
    throw new Error("avatar component export is not a function");
  }
  const ListenerImpressionAvatar = avatarExport as ComponentType<{
    name: string;
    url: string | null;
  }>;
  const letterMarkup = renderToStaticMarkup(
    createElement(ListenerImpressionAvatar, { name: "Мария", url: null }),
  );
  assert.match(letterMarkup, /role="img"/);
  assert.match(letterMarkup, /aria-label="Аватар: Мария"/);
  assert.match(letterMarkup, />М</);
  const imageMarkup = renderToStaticMarkup(
    createElement(ListenerImpressionAvatar, { name: "Мария", url: safe }),
  );
  assert.match(imageMarkup, /<img /);
  assert.match(imageMarkup, /alt="Аватар: Мария"/);
  const avatarUi = read("src/components/products/practice-page/ListenerImpressionAvatar.tsx");
  assert.match(avatarUi, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.doesNotMatch(avatarUi, /—/);
  assert.doesNotMatch(avatarUi, /md:hidden|hidden md:/);

  const page = read("src/components/products/practice-page/PracticePageContent.tsx");
  assert.equal(page.split("<PracticeComments").length - 1, 1);
  const commentsUi = read("src/components/products/practice-page/PracticeComments.tsx");
  assert.equal(commentsUi.split("<ListenerImpressionAvatar").length - 1, 2);
  const authorUi = read("src/components/author-dashboard/AuthorListenerFeedback.tsx");
  assert.equal(authorUi.split("<ListenerImpressionAvatar").length - 1, 2);

  const safeStore = createMemoryCommentStore(
    state({
      profileAvatars: {
        [listener]: { url: safe, fullName: "Мария Петрова" },
        [authorUser]: {
          url: "https://cdn.example/people/anna-private.webp",
          path: `${authorUser}/face.webp`,
          fullName: "Анна Светлая",
        },
      },
      authorAvatars: {
        [practiceId]: { url: "https://cdn.example/workspaces/anna.webp", name: "Анна Светлая" },
      },
    }),
  );
  const created = await createImpression(safeStore, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Стало спокойнее",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.comment.avatarUrl, safe);
  const createdJson = JSON.stringify(created.comment);
  assert.equal(createdJson.includes(listener), false);
  assert.equal(createdJson.includes("Петрова"), false);
  assert.equal(createdJson.includes("@"), false);
  assert.equal("userId" in created.comment, false);

  const replied = await replyAsAuthor(safeStore, actor(authorUser), clock(), {
    commentId: created.comment.id,
    body: "Спасибо за отзыв",
    clientRequestId: null,
  });
  assert.equal(replied.ok, true);
  if (!replied.ok) return;
  assert.equal(replied.comment.reply?.avatarUrl, "https://cdn.example/workspaces/anna.webp");
  assert.equal(replied.comment.reply?.avatarUrl?.includes("anna-private"), false);
  assert.equal(replied.comment.reply?.avatarUrl?.includes(authorUser), false);
  assert.equal(replied.comment.avatarUrl, safe);

  const feedback = await listAuthorFeedback(safeStore, actor(authorUser), {
    authorId: gate().authorId,
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(feedback.ok, true);
  if (!feedback.ok) return;
  assert.equal(feedback.comments[0]?.avatarUrl, safe);
  assert.equal(feedback.comments[0]?.reply?.avatarUrl, "https://cdn.example/workspaces/anna.webp");

  const leakId = commentUuid("99999999", 8);
  const leakStore = createMemoryCommentStore(
    state({
      comments: [impressionRow(leakId, isoSeconds(3), "Тихий вечер")],
      profileAvatars: {
        [listener]: {
          url: `https://cdn.example/sign/${listener}/photo.webp?token=secret`,
          path: `${listener}/photo.webp`,
          fullName: "Мария Петрова",
        },
      },
    }),
  );
  const leaked = await listPracticeComments(leakStore, actor(other), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(leaked.ok, true);
  if (!leaked.ok) return;
  assert.equal(leaked.comments[0]?.avatarUrl, `/api/listener-comment-avatars/${leakId}`);
  assert.equal(leaked.comments[0]?.avatarUrl?.includes(listener), false);
  assert.equal(JSON.stringify(leaked.comments).includes("token="), false);
  assert.equal(JSON.stringify(leaked.comments).includes("Петрова"), false);

  const bare = await listPracticeComments(createMemoryCommentStore(state({
    comments: [impressionRow(commentUuid("99999999", 9), isoSeconds(4), "Ровный голос")],
  })), actor(null), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(bare.ok, true);
  if (!bare.ok) return;
  assert.equal(bare.comments[0]?.avatarUrl, null);
  assert.equal(bare.viewer.canComment, false);
  assert.equal(bare.viewer.avatarUrl, null);

  const previewStore = createMemoryCommentStore(
    state({
      profileAvatars: {
        [listener]: {
          url: `https://cdn.example/sign/${listener}/photo.webp?token=secret`,
          path: `${listener}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`,
          fullName: "Мария Петрова",
        },
      },
    }),
  );
  const preview = await listPracticeComments(previewStore, actor(listener), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.viewer.avatarUrl, LISTENER_VIEWER_AVATAR_PATH);
  const previewJson = JSON.stringify(preview.viewer);
  assert.equal(previewJson.includes(listener), false);
  assert.equal(previewJson.includes("token="), false);
  assert.equal(previewJson.includes("Петрова"), false);
  assert.equal(previewJson.includes("/user-avatars/"), false);
  const guestPreview = await listPracticeComments(previewStore, actor(null), {
    authorSlug: "anna",
    productSlug: "tihaya",
    sort: "new",
    cursor: null,
    limit: 10,
  });
  assert.equal(guestPreview.ok, true);
  if (!guestPreview.ok) return;
  assert.equal(guestPreview.viewer.avatarUrl, null);

  const route = read("src/app/api/listener-comment-avatars/[commentId]/route.ts");
  assert.match(route, /isValidUserAvatarPath/);
  assert.match(route, /practice_listener_comment_feed/);
  assert.match(route, /openListenerCommentAvatar/);
  assert.doesNotMatch(route, /Response\.json|NextResponse\.json/);
  assert.doesNotMatch(route, /status !== "published"|comment\.status|actor\.userId/);
  const feedAt = route.indexOf("practice_listener_comment_feed");
  const downloadAt = route.indexOf(".download(");
  assert.ok(feedAt >= 0 && downloadAt > feedAt);

  const photo = new Uint8Array([1, 2, 3, 4]);
  const feedCases = [
    {
      name: "visible",
      visible: isListenerCommentFeedVisible({
        row: { userId: listener, parentId: null, status: "published", deletedAt: null },
        viewerUserId: null,
        practiceAcceptsComments: true,
        parentPublished: true,
        viewerIsPracticeAuthor: false,
      }),
      status: 200,
    },
    {
      name: "unpublished practice",
      visible: isListenerCommentFeedVisible({
        row: { userId: listener, parentId: null, status: "published", deletedAt: null },
        viewerUserId: other,
        practiceAcceptsComments: false,
        parentPublished: true,
        viewerIsPracticeAuthor: false,
      }),
      status: 404,
    },
    {
      name: "music product",
      visible: isListenerCommentFeedVisible({
        row: { userId: listener, parentId: null, status: "published", deletedAt: null },
        viewerUserId: null,
        practiceAcceptsComments: false,
        parentPublished: true,
        viewerIsPracticeAuthor: false,
      }),
      status: 404,
    },
    {
      name: "hidden",
      visible: isListenerCommentFeedVisible({
        row: { userId: listener, parentId: null, status: "hidden", deletedAt: null },
        viewerUserId: other,
        practiceAcceptsComments: true,
        parentPublished: true,
        viewerIsPracticeAuthor: false,
      }),
      status: 404,
    },
    {
      name: "deleted",
      visible: isListenerCommentFeedVisible({
        row: {
          userId: listener,
          parentId: null,
          status: "deleted",
          deletedAt: "2026-10-26T00:00:00.000Z",
        },
        viewerUserId: listener,
        practiceAcceptsComments: true,
        parentPublished: true,
        viewerIsPracticeAuthor: false,
      }),
      status: 404,
    },
  ];
  for (const item of feedCases) {
    const response = openListenerCommentAvatar({
      feed: item.visible ? { kind: "impression" } : null,
      image: { bytes: photo, contentType: "image/webp" },
    });
    assert.equal(response.status, item.status, item.name);
    const body = new Uint8Array(await response.arrayBuffer());
    if (item.status === 404) {
      assert.equal(body.byteLength, 0, item.name);
    } else {
      assert.deepEqual(body, photo);
    }
    assert.equal(new TextDecoder().decode(body).includes(listener), false, item.name);
  }
  assert.equal(feedCases.find((item) => item.name === "visible")?.visible, true);
  assert.equal(
    feedCases.filter((item) => item.name !== "visible").every((item) => item.visible === false),
    true,
  );

  const hiddenOwner = isListenerCommentFeedVisible({
    row: { userId: listener, parentId: null, status: "hidden", deletedAt: null },
    viewerUserId: listener,
    practiceAcceptsComments: true,
    parentPublished: true,
    viewerIsPracticeAuthor: false,
  });
  assert.equal(hiddenOwner, true);
  const ownerHidden = openListenerCommentAvatar({
    feed: { kind: "impression" },
    image: { bytes: photo, contentType: "image/webp" },
  });
  assert.equal(ownerHidden.status, 200);
  const viewerAvatar = read("src/lib/practice-comments/viewer-avatar.ts");
  assert.match(viewerAvatar, /getUser\(\)/);
  assert.match(viewerAvatar, /avatar_path/);
  assert.match(viewerAvatar, /isValidUserAvatarPath/);
  assert.doesNotMatch(viewerAvatar, /searchParams|Response\.json/);
  assert.match(route, /commentId === "me"/);
  assert.match(route, /openSignedInListenerAvatar/);

  const migration = read("supabase/migrations/20270124140000_practice_listener_comments.sql");
  const avatarFnStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.practice_listener_comment_public_avatar",
  );
  const avatarFn = migration.slice(
    avatarFnStart,
    migration.indexOf("CREATE OR REPLACE VIEW public.practice_listener_comment_feed"),
  );
  assert.match(avatarFn, /FROM public\.profiles/);
  assert.match(avatarFn, /p\.avatar_url, p\.avatar_path, p\.full_name/);
  assert.match(avatarFn, /listener-comment-avatars/);
  const viewStart = migration.indexOf("CREATE OR REPLACE VIEW public.practice_listener_comment_feed");
  const viewSelect = migration.slice(viewStart, migration.indexOf("FROM public.practice_listener_comments AS c", viewStart));
  assert.match(viewSelect, /AS avatar_url/);
  assert.doesNotMatch(viewSelect, /AS user_id|email|full_name|avatar_path|surname/);
}

async function testAuthorCommentHistory() {
  const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const otherAuthor = "66666666-6666-4666-8666-666666666666";
  const store = createMemoryCommentStore(
    state({
      gates: [
        gate({ title: "Тихая", productSlug: "tihaya" }),
        gate({
          practiceId: secondId,
          title: "Вторая",
          productSlug: "vtoraya",
          authorId: otherAuthor,
        }),
      ],
      memberships: [
        { userId: authorUser, practiceId, authorId: gate().authorId },
        { userId: authorUser, practiceId: secondId, authorId: otherAuthor },
      ],
    }),
  );
  const first = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Первый отзыв на практику",
    publicName: "Мария",
    clientRequestId: null,
  });
  const second = await createImpression(store, actor(other), clock(), {
    authorSlug: "anna",
    productSlug: "vtoraya",
    body: "Второй отзыв на практику",
    publicName: "Илья",
    clientRequestId: null,
  });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;

  const pageQuery = {
    authorId: null as string | null,
    sort: "new" as const,
    cursor: null,
    limit: 10,
  };
  const all = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(all.ok && all.comments.length, 2);
  if (!all.ok) return;
  assert.equal(all.unreadCount, 2);
  assert.equal(all.comments.every((item) => item.unread && item.noticeId), true);
  const labelled = all.comments.find((item) => item.id === first.comment.id);
  assert.equal(labelled?.practiceTitle, "Тихая");
  assert.equal(labelled?.authorName, "Анна Светлая");
  assert.match(labelled?.practiceHref ?? "", new RegExp(`#listener-comment-${first.comment.id}$`));

  const oneWorkspace = await listAuthorFeedback(store, actor(authorUser), {
    ...pageQuery,
    authorId: otherAuthor,
    filter: "all",
  });
  assert.equal(oneWorkspace.ok && oneWorkspace.comments.length, 1);
  if (oneWorkspace.ok) assert.equal(oneWorkspace.comments[0]?.id, second.comment.id);

  const stranger = await listAuthorFeedback(store, actor(listener), {
    ...pageQuery,
    authorId: gate().authorId,
    filter: "all",
  });
  assert.equal(stranger.ok, false);
  if (!stranger.ok) assert.equal(stranger.status, 403);

  const marked = await markAuthorImpressionNotices(store, actor(authorUser), clock(), {
    noticeIds: all.comments.map((item) => item.noticeId).filter((id): id is string => id != null),
  });
  assert.equal(marked.ok && marked.unreadCount, 0);
  const history = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(history.ok && history.comments.length, 2);
  if (history.ok) assert.equal(history.comments.every((item) => item.unread === false), true);
  const noNew = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "new" });
  assert.equal(noNew.ok && noNew.comments.length, 0);

  const reply = await replyAsAuthor(store, actor(authorUser), clock(), {
    commentId: first.comment.id,
    body: "Спасибо за первый отзыв",
    clientRequestId: "77777777-7777-4777-8777-777777777772",
  });
  assert.equal(reply.ok, true);
  const unanswered = await listAuthorFeedback(store, actor(authorUser), {
    ...pageQuery,
    filter: "unanswered",
  });
  assert.equal(unanswered.ok && unanswered.comments.length, 1);
  if (unanswered.ok) assert.equal(unanswered.comments[0]?.id, second.comment.id);
  const withReply = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  if (withReply.ok) {
    assert.equal(
      withReply.comments.find((item) => item.id === first.comment.id)?.reply?.body,
      "Спасибо за первый отзыв",
    );
  }

  const hidden = await moderateComment(store, actor(moderator, true, false), clock(), {
    commentId: second.comment.id,
    action: "hide",
    reason: "spam",
  });
  assert.equal(hidden.ok, true);
  const afterHide = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(afterHide.ok && afterHide.comments.some((item) => item.id === second.comment.id), false);
  const unread = await countUnreadAuthorImpressions(store, actor(authorUser));
  assert.equal(unread.ok && unread.unreadCount, 0);

  const removed = await deleteOwnComment(store, actor(listener), clock(), first.comment.id);
  assert.equal(removed.ok, true);
  const afterDelete = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(afterDelete.ok && afterDelete.comments.length, 0);

  const fresh = await createImpression(store, actor(other), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Новый отзыв после удаления",
    publicName: "Илья",
    clientRequestId: null,
  });
  assert.equal(fresh.ok, true);
  const cleared = await markAuthorImpressionNotices(store, actor(authorUser), clock(), { all: true });
  assert.equal(cleared.ok && cleared.unreadCount, 0);
  const stayed = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(stayed.ok && stayed.comments.length, 1);

  const page = read("src/components/products/practice-page/PracticeComments.tsx");
  assert.match(page, /id=\{`listener-comment-\$\{comment\.id\}`\}/);
  assert.match(page, /hashCommentId/);
  assert.match(read("src/lib/practice-comments/deep-link.ts"), /#listener-comment-/);
  assert.match(page, /commentId/);
  assert.match(read("src/lib/practice-comments/copy.ts"), /Комментарии/);
  assert.doesNotMatch(read("src/components/author-dashboard/AuthorListenerFeedback.tsx"), /—/);
}

async function testAuthorNoticeConsistency() {
  const comments: ListenerCommentRow[] = [];
  const notices: CommentNoticeRow[] = [];
  for (let index = 1; index <= 25; index += 1) {
    const id = commentUuid("aaaaaaaa", index);
    const createdAt = isoSeconds(index);
    comments.push(impressionRow(id, createdAt, `Отзыв номер ${index} для истории`));
    notices.push({
      id: commentUuid("bbbbbbbb", index),
      recipientUserId: authorUser,
      commentId: id,
      practiceId,
      kind: "new_impression",
      readAt: null,
      createdAt,
    });
  }
  const hiddenId = commentUuid("aaaaaaaa", 90);
  comments.push(impressionRow(hiddenId, isoSeconds(90), "Скрытый отзыв не считается", "hidden"));
  notices.push({
    id: commentUuid("bbbbbbbb", 90),
    recipientUserId: authorUser,
    commentId: hiddenId,
    practiceId,
    kind: "new_impression",
    readAt: null,
    createdAt: isoSeconds(90),
  });
  const store = createMemoryCommentStore(state({ comments, notices }));
  const pageQuery = {
    authorId: null as string | null,
    sort: "new" as const,
    cursor: null,
    limit: 30,
  };
  const listed = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "new" });
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.equal(listed.comments.length, 25);
  assert.equal(listed.unreadCount, 25);
  assert.equal(listed.comments.every((item) => item.unread && item.productSlug === "tihaya"), true);
  assert.equal(listed.comments.every((item) => item.authorSlug === "anna"), true);
  const counted = await countUnreadAuthorImpressions(store, actor(authorUser));
  assert.equal(counted.ok && counted.unreadCount, listed.unreadCount);
  const noticeIds = listed.comments
    .map((item) => item.noticeId)
    .filter((id): id is string => id != null);
  assert.equal(noticeIds.length, 25);
  const marked = await markAuthorImpressionNotices(store, actor(authorUser), clock(), { noticeIds });
  assert.equal(marked.ok && marked.unreadCount, 0);
  const afterShown = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "new" });
  assert.equal(afterShown.ok && afterShown.comments.length, 0);
  for (const notice of notices) notice.readAt = null;
  const restored = await countUnreadAuthorImpressions(store, actor(authorUser));
  assert.equal(restored.ok && restored.unreadCount, 25);
  const cleared = await markAuthorImpressionNotices(store, actor(authorUser), clock(), { all: true });
  assert.equal(cleared.ok && cleared.unreadCount, 0);
  const history = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(history.ok && history.comments.length, 25);

  const target = comments[0]!;
  const wrongSlug = await replyAsAuthor(store, actor(authorUser), clock(), {
    commentId: target.id,
    body: "Спасибо за отзыв",
    clientRequestId: commentUuid("cccccccc", 1),
    authorSlug: "anna",
    productSlug: "anna",
  });
  assert.equal(wrongSlug.ok, false);
  if (!wrongSlug.ok) assert.equal(wrongSlug.status, 400);
  const rightSlug = await replyAsAuthor(store, actor(authorUser), clock(), {
    commentId: target.id,
    body: "Спасибо за отзыв",
    clientRequestId: commentUuid("cccccccc", 2),
    authorSlug: "anna",
    productSlug: "tihaya",
  });
  assert.equal(rightSlug.ok, true);
  const unanswered = await listAuthorFeedback(store, actor(authorUser), {
    ...pageQuery,
    filter: "unanswered",
  });
  assert.equal(unanswered.ok && unanswered.comments.length, 24);
  if (unanswered.ok) {
    assert.equal(
      unanswered.comments.some((item) => item.id === target.id),
      false,
    );
  }

  const later = comments[20]!;
  assert.equal(hashCommentId(`#listener-comment-${later.id}`), later.id);
  assert.equal(hashCommentId("#listener-impressions"), null);
  assert.equal(
    shouldLoadAnotherCommentPage({
      targetId: later.id,
      loadedIds: comments.slice(0, 10).map((item) => item.id),
      nextCursor: "page-2",
      previousCursor: null,
      pagesRead: 1,
    }),
    true,
  );
  assert.equal(
    shouldLoadAnotherCommentPage({
      targetId: target.id,
      loadedIds: [target.id],
      nextCursor: "page-2",
      previousCursor: null,
      pagesRead: 1,
    }),
    false,
  );
  assert.equal(
    shouldLoadAnotherCommentPage({
      targetId: target.id,
      loadedIds: [],
      nextCursor: null,
      previousCursor: null,
      pagesRead: 1,
    }),
    false,
  );
  assert.equal(
    shouldLoadAnotherCommentPage({
      targetId: target.id,
      loadedIds: [],
      nextCursor: "same",
      previousCursor: "same",
      pagesRead: 2,
    }),
    false,
  );
  assert.equal(
    shouldLoadAnotherCommentPage({
      targetId: target.id,
      loadedIds: [],
      nextCursor: "next",
      previousCursor: null,
      pagesRead: LISTENER_COMMENT_HASH_PAGE_CAP,
    }),
    false,
  );

  const storeSource = read("src/lib/practice-comments/supabase-store.ts");
  assert.doesNotMatch(storeSource, /\.limit\(500\)/);
  assert.doesNotMatch(storeSource, /\.limit\(2000\)/);
  assert.doesNotMatch(storeSource, /not\("id", "in"/);
  assert.doesNotMatch(storeSource, /\.in\("practice_id", input/);
  assert.match(storeSource, /practices\.author_id/);
  assert.match(storeSource, /author_replies/);
  assert.match(storeSource, /\.is\("author_replies", null\)/);
  assert.match(storeSource, /\.range\(/);
  assert.match(storeSource, /practice_listener_comment_notices!inner/);
  const selectFn = storeSource.slice(
    storeSource.indexOf("function impressionSelect"),
    storeSource.indexOf("function unreadNoticeQuery"),
  );
  assert.doesNotMatch(selectFn, /user_id|email|full_name|surname/);

  const service = read("src/lib/practice-comments/service.ts");
  assert.doesNotMatch(service, /\.slice\(0,\s*20\)/);
  const feedback = service.slice(
    service.indexOf("export async function listAuthorFeedback"),
    service.indexOf("export async function countUnreadAuthorImpressions"),
  );
  assert.match(feedback, /getPracticeContexts\(/);
  assert.match(feedback, /listRepliesForParents\(/);
  assert.doesNotMatch(feedback, /getPracticeContext\(/);
  assert.doesNotMatch(feedback, /(?<!listRepliesForParents)listReplies\(/);

  const page = read("src/components/products/practice-page/PracticeComments.tsx");
  assert.match(page, /pagesRead/);
  assert.match(page, /shouldLoadAnotherCommentPage/);
  assert.match(page, /hashCommentId/);
  const cabinet = read("src/components/author-dashboard/AuthorListenerFeedback.tsx");
  assert.match(cabinet, /item\.productSlug/);
  assert.match(cabinet, /IntersectionObserver/);
  assert.doesNotMatch(cabinet, /practiceHref\.split\("\/"\)\[2\]/);
  assert.doesNotMatch(cabinet, /items\.flatMap\(\(item\) => \(item\.unread/);
  assert.doesNotMatch(cabinet, /—/);
  const route = read(
    "src/app/api/listen/product/[slug]/[productSlug]/comments/[commentId]/reply/route.ts",
  );
  assert.match(route, /authorSlug: slug/);
  assert.match(route, /productSlug/);
  const shell = read("src/components/listener/ListenerAppShell.tsx");
  assert.match(shell, /data-author-cabinet-mobile/);
  assert.match(shell, /xl:hidden/);
  assert.match(read("src/components/profile/ProfileSections.tsx"), /AuthorUnreadCommentBadge/);
  const authorShell = read("src/components/author-dashboard/AuthorShell.tsx");
  assert.match(authorShell, /data-author-shell-subtitle/);
  const subtitle = authorShell.slice(
    authorShell.indexOf("data-author-shell-subtitle") - 180,
    authorShell.indexOf("data-author-shell-subtitle"),
  );
  assert.doesNotMatch(subtitle, /truncate/);
}

async function testCombinedAuthorWorkspaces() {
  const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const otherAuthor = "66666666-6666-4666-8666-666666666666";
  const oldestId = commentUuid("dddddddd", 1);
  const middleId = commentUuid("dddddddd", 2);
  const newestId = commentUuid("dddddddd", 3);
  const comments = [
    impressionRow(oldestId, isoSeconds(10), "Старый отзыв первого проекта"),
    { ...impressionRow(middleId, isoSeconds(20), "Средний отзыв первого проекта"), practiceId },
    {
      ...impressionRow(newestId, isoSeconds(30), "Новый отзыв второго проекта"),
      practiceId: secondId,
    },
  ];
  const notices: CommentNoticeRow[] = comments.map((row, index) => ({
    id: commentUuid("eeeeeeee", index + 1),
    recipientUserId: authorUser,
    commentId: row.id,
    practiceId: row.practiceId,
    kind: "new_impression",
    readAt: null,
    createdAt: row.createdAt,
  }));
  const store = createMemoryCommentStore(
    state({
      gates: [
        gate({ title: "Тихая", productSlug: "tihaya", authorName: "Анна Светлая" }),
        gate({
          practiceId: secondId,
          title: "Вечер",
          productSlug: "vecher",
          authorId: otherAuthor,
          authorSlug: "aurafon",
          authorName: "Аурафон",
        }),
      ],
      memberships: [
        { userId: authorUser, practiceId, authorId: gate().authorId },
        { userId: authorUser, practiceId: secondId, authorId: otherAuthor },
      ],
      comments,
      notices,
    }),
  );
  const base = {
    authorId: null as string | null,
    cursor: null,
    limit: 1,
  };
  const firstPage = await listAuthorFeedback(store, actor(authorUser), {
    ...base,
    sort: "new",
    filter: "all",
  });
  assert.equal(firstPage.ok, true);
  if (!firstPage.ok) return;
  assert.equal(firstPage.comments.length, 1);
  assert.equal(firstPage.comments[0]?.id, newestId);
  assert.equal(firstPage.comments[0]?.authorName, "Аурафон");
  assert.equal(firstPage.comments[0]?.practiceTitle, "Вечер");
  assert.equal(firstPage.unreadCount, 3);
  assert.ok(firstPage.nextCursor);
  const secondPage = await listAuthorFeedback(store, actor(authorUser), {
    ...base,
    sort: "new",
    filter: "all",
    cursor: decodeCommentCursor(firstPage.nextCursor),
  });
  assert.equal(secondPage.ok && secondPage.comments[0]?.id, middleId);
  if (secondPage.ok) {
    assert.equal(secondPage.comments[0]?.authorName, "Анна Светлая");
    assert.equal(secondPage.comments[0]?.practiceTitle, "Тихая");
  }
  const oldestFirst = await listAuthorFeedback(store, actor(authorUser), {
    ...base,
    sort: "old",
    filter: "all",
  });
  assert.equal(oldestFirst.ok && oldestFirst.comments[0]?.id, oldestId);
  const fresh = await listAuthorFeedback(store, actor(authorUser), {
    authorId: null,
    sort: "new",
    cursor: null,
    limit: 10,
    filter: "new",
  });
  assert.equal(fresh.ok && fresh.comments.length, 3);
  const unansweredBefore = await listAuthorFeedback(store, actor(authorUser), {
    authorId: null,
    sort: "old",
    cursor: null,
    limit: 10,
    filter: "unanswered",
  });
  assert.equal(unansweredBefore.ok && unansweredBefore.comments.length, 3);
  const reply = await replyAsAuthor(store, actor(authorUser), clock(), {
    commentId: newestId,
    body: "Спасибо за отзыв второго проекта",
    clientRequestId: commentUuid("ffffffff", 1),
    authorSlug: "aurafon",
    productSlug: "vecher",
  });
  assert.equal(reply.ok, true);
  const unanswered = await listAuthorFeedback(store, actor(authorUser), {
    authorId: null,
    sort: "new",
    cursor: null,
    limit: 10,
    filter: "unanswered",
  });
  assert.equal(unanswered.ok && unanswered.comments.length, 2);
  if (unanswered.ok) {
    assert.equal(
      unanswered.comments.some((item) => item.id === newestId),
      false,
    );
    assert.equal(unanswered.comments.some((item) => item.authorName === "Анна Светлая"), true);
  }
  const onlySecond = await listAuthorFeedback(store, actor(authorUser), {
    authorId: otherAuthor,
    sort: "new",
    cursor: null,
    limit: 10,
    filter: "all",
  });
  assert.equal(onlySecond.ok && onlySecond.comments.length, 1);
  if (onlySecond.ok) {
    assert.equal(onlySecond.comments[0]?.id, newestId);
    assert.equal(onlySecond.unreadCount, 3);
  }
  const stranger = await listAuthorFeedback(store, actor(listener), {
    authorId: otherAuthor,
    sort: "new",
    cursor: null,
    limit: 10,
    filter: "all",
  });
  assert.equal(stranger.ok, false);

  const ui = read("src/components/author-dashboard/AuthorListenerFeedback.tsx");
  assert.doesNotMatch(ui, /useState\(\s*authors\[0\]/);
  assert.match(ui, /authors\.length > 1/);
  assert.match(ui, /AUTHOR_COMMENTS_ALL_PROJECTS/);
  assert.match(ui, /if \(authorId\) params\.set\("authorId", authorId\)/);
  assert.match(ui, /data-author-comment-workspace=\{item\.authorName\}/);
  assert.match(ui, /data-author-comment-product=\{item\.practiceTitle\}/);
  assert.match(ui, /AUTHOR_COMMENTS_FILTER_ALL/);
  assert.match(ui, /AUTHOR_COMMENTS_FILTER_NEW/);
  assert.match(ui, /AUTHOR_COMMENTS_FILTER_UNANSWERED/);
  const page = read("src/app/(platform)/author-dashboard/feedback/page.tsx");
  assert.match(page, /AuthorListenerFeedback/);
  assert.doesNotMatch(page, /authors\[0\]/);
}

async function testOtherListenerUnreadBadge() {
  const store = createMemoryCommentStore(state());
  const pageQuery = {
    authorId: null as string | null,
    sort: "new" as const,
    cursor: null,
    limit: 10,
  };
  const own = await createImpression(store, actor(authorUser), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Свой отзыв автора на свой продукт",
    publicName: "Анна",
    clientRequestId: null,
  });
  assert.equal(own.ok, true);
  const afterOwn = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(afterOwn.ok, true);
  if (!afterOwn.ok) return;
  assert.equal(afterOwn.comments.length, 1);
  assert.equal(afterOwn.unreadCount, 0);
  assert.equal(afterOwn.comments[0]?.unread, false);
  assert.equal(afterOwn.comments[0]?.noticeId, null);

  const foreign = await createImpression(store, actor(listener), clock(), {
    authorSlug: "anna",
    productSlug: "tihaya",
    body: "Отзыв другого слушателя на продукт",
    publicName: "Мария",
    clientRequestId: null,
  });
  assert.equal(foreign.ok, true);
  if (!foreign.ok) return;
  const unread = await countUnreadAuthorImpressions(store, actor(authorUser));
  assert.equal(unread.ok && unread.unreadCount, 1);
  const fresh = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "new" });
  assert.equal(fresh.ok, true);
  if (!fresh.ok) return;
  assert.equal(fresh.comments.length, 1);
  assert.equal(fresh.comments[0]?.id, foreign.comment.id);
  assert.equal(fresh.comments[0]?.unread, true);
  assert.equal(fresh.comments[0]?.publicName, "Мария");
  assert.ok(fresh.comments[0]?.noticeId);
  const history = await listAuthorFeedback(store, actor(authorUser), { ...pageQuery, filter: "all" });
  assert.equal(history.ok, true);
  if (!history.ok) return;
  assert.equal(history.comments.length, 2);
  assert.equal(history.unreadCount, 1);
  assert.equal(
    history.comments.find((item) => item.publicName === "Анна")?.unread,
    false,
  );

  const quiet = renderToStaticMarkup(
    createElement(AuthorUnreadCommentBadgeView, { count: 0, placement: "nav" }),
  );
  assert.equal(quiet, "");
  const one = renderToStaticMarkup(
    createElement(AuthorUnreadCommentBadgeView, { count: 1, placement: "nav" }),
  );
  assert.match(one, /data-author-unread-comments="1"/);
  assert.match(one, />1</);
  assert.match(one, new RegExp(AUTHOR_UNREAD_CIRCLE_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const two = renderToStaticMarkup(
    createElement(AuthorUnreadCommentBadgeView, { count: 2, placement: "nav" }),
  );
  assert.match(two, /data-author-unread-comments="2"/);

  const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
  assert.match(nav, /useAuthorUnreadCommentCount/);
  assert.match(nav, /AuthorUnreadCommentBadgeView/);
  assert.match(nav, /data-author-comments-unread/);
  assert.match(nav, /AUTHOR_UNREAD_PILL_CLASS/);
  assert.match(read("src/components/author-dashboard/AuthorListenerFeedback.tsx"), /AUTHOR_UNREAD_CARD_CLASS/);
  assert.match(read("src/components/author-dashboard/AuthorUnreadCommentBadge.tsx"), /bg-\[#c2410c\]/);
  assert.match(read("src/components/author-dashboard/AuthorUnreadCommentBadge.tsx"), /bg-\[#fff3e0\]/);
  assert.match(AUTHOR_UNREAD_PILL_CLASS, /bg-\[#fff3e0\]/);
  assert.match(AUTHOR_UNREAD_CARD_CLASS, /bg-\[#fff3e0\]/);
  assert.match(read("src/lib/practice-comments/service.ts"), /recipientUserId === actor\.userId/);
  assert.doesNotMatch(
    `${AUTHOR_UNREAD_PILL_CLASS} ${AUTHOR_UNREAD_CARD_CLASS} ${AUTHOR_UNREAD_CIRCLE_CLASS}`,
    /—/,
  );
}

await testOtherListenerUnreadBadge();
await testCombinedAuthorWorkspaces();
await testAuthorNoticeConsistency();
await testAuthorCommentHistory();
await testAvatars();
await testPrivacyAndXss();
await testCreateListEditDelete();
await testProductGatesAndRatingsIsolation();
await testSpamPaginationAndAuthorReply();
await testReportModeration();
await testModerationQueuePagesPastTwentyOne();
await testEditAndReplyRateLimits();
await testEmptyAndPlayerCopy();
await testSignedInListenerSeesComposer();
await testModeratorScopeAndQueueSource();
await testEveryProductSurfaceAndOwnerDelete();
console.log("practice-listener-comments-unit: ok");
