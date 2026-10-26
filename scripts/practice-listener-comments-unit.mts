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

import * as ListenerCommentComposerModule from "../src/components/products/practice-page/ListenerCommentComposer";
import * as ListenerImpressionAvatarModule from "../src/components/products/practice-page/ListenerImpressionAvatar";
import {
  listenerAvatarColor,
  listenerAvatarLetter,
  listenerAvatarPresentation,
  sanitizePublicAvatarUrl,
} from "../src/lib/practice-comments/avatar";
import { openListenerCommentAvatar } from "../src/lib/practice-comments/avatar-proxy";
import { isListenerCommentFeedVisible } from "../src/lib/practice-comments/visibility";

import { resolveListenerCommentComposer } from "../src/lib/practice-comments/composer";
import {
  LISTENER_IMPRESSION_INVITE,
  LISTENER_IMPRESSION_LOAD_MORE,
  LISTENER_IMPRESSION_PRIVACY,
  LISTENER_IMPRESSION_SIGN_IN,
  LISTENER_IMPRESSION_SUBMIT,
  MODERATION_ACTION_LABELS,
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
  createImpression,
  deleteOwnComment,
  listAuthorFeedback,
  listListenerNotices,
  listModerationQueue,
  listPracticeComments,
  moderateComment,
  replyAsAuthor,
  reportComment,
  updateOwnComment,
} from "../src/lib/practice-comments/service";
import type { ListenerCommentRow } from "../src/lib/practice-comments/types";
import {
  commentFingerprint,
  deriveDefaultPublicName,
  parseCommentBody,
} from "../src/lib/practice-comments/text";
import {
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

const actor = (userId: string | null, isModerator = false) => ({ userId, isModerator });

async function testPrivacyAndXss() {
  assert.equal(deriveDefaultPublicName("Мария Петрова"), "Мария");
  assert.equal(deriveDefaultPublicName("maria@example.com"), "Слушатель");
  assert.equal(deriveDefaultPublicName("Мария petrov@mail.ru"), "Мария");
  assert.equal(parseCommentBody("<script>alert(1)</script>").ok, false);
  assert.equal(parseCommentBody('"><img src=x onerror=alert(1)>').ok, false);
  assert.equal(parseCommentBody("стало спокойнее").ok, true);
  assert.equal(commentFingerprint("  Стало   спокойнее "), "стало спокойнее");
  assert.doesNotMatch(LISTENER_IMPRESSION_INVITE, /дискомфорт|лечен|гарант|терап|исцел/i);
  assert.doesNotMatch(LISTENER_IMPRESSION_PRIVACY, /дискомфорт|лечен|гарант|терап|исцел|диагноз|Не указывайте/i);
  assert.match(LISTENER_IMPRESSION_INVITE, /–/);
  assert.doesNotMatch(LISTENER_IMPRESSION_INVITE, /—/);
  assert.match(LISTENER_IMPRESSION_PRIVACY, /Фамилия и почта не показываются/);
  assert.match(LISTENER_IMPRESSION_PRIVACY, /Поделитесь впечатлением от практики/);
  assert.match(LISTENER_IMPRESSION_PRIVACY, /–/);
  assert.doesNotMatch(LISTENER_IMPRESSION_PRIVACY, /—/);
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
  assert.equal(musicWrite.ok, false);
  if (!musicWrite.ok) assert.equal(musicWrite.error, "product_not_commentable");

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
  assert.equal(postWrite.ok, false);

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
      status: "published",
    }),
    true,
  );

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

function componentExport<Props>(module: { default: unknown }): (props: Props) => unknown {
  let value: unknown = module.default;
  while (value && typeof value === "object" && "default" in value) {
    value = (value as { default: unknown }).default;
  }
  if (typeof value !== "function") {
    throw new Error("component export is not a function");
  }
  return value as (props: Props) => unknown;
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
      publicName: "Олег",
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
  assert.match(formMarkup, new RegExp(LISTENER_IMPRESSION_SUBMIT));
  assert.match(formMarkup, /id="listener-impression-body"/);
  assert.doesNotMatch(formMarkup, /Оценки гостей/);

  const guestMarkup = renderToStaticMarkup(
    createElement(Composer, {
      mode: "sign_in",
      publicName: "",
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
  assert.doesNotMatch(guestMarkup, /—/);

  const route = read("src/app/api/listen/product/[slug]/[productSlug]/comments/route.ts");
  const server = read("src/lib/practice-comments/server.ts");
  const commentsUi = read("src/components/products/practice-page/PracticeComments.tsx");
  const stars = read("src/components/products/practice-page/PracticeRatingStars.tsx");
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(server, /Cache-Control": "private, no-store"/);
  assert.match(server, /Vary: "Cookie"/);
  assert.match(commentsUi, /cache: "no-store"/);
  assert.match(commentsUi, /resolveListenerCommentComposer/);
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
  assert.match(panel, /MODERATION_ACTION_LABELS/);
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
  const migration = read("supabase/migrations/20270124140000_practice_listener_comments.sql");
  const viewStart = migration.indexOf("CREATE OR REPLACE VIEW public.practice_listener_comment_feed");
  const viewSelect = migration.slice(viewStart, migration.indexOf("FROM public.practice_listener_comments AS c", viewStart));
  assert.match(viewSelect, /AS avatar_url/);
  assert.doesNotMatch(viewSelect, /AS user_id|email|full_name|avatar_path|surname/);
}

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
console.log("practice-listener-comments-unit: ok");
