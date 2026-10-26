#!/usr/bin/env node
/**
 * Listener impressions: text, privacy, spam, pagination, author reply,
 * moderation and separation from star ratings.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LISTENER_IMPRESSION_INVITE,
  LISTENER_IMPRESSION_PRIVACY,
} from "../src/lib/practice-comments/copy";
import {
  createMemoryCommentStore,
  memoryId,
  type MemoryCommentState,
} from "../src/lib/practice-comments/memory-store";
import { encodeCommentCursor } from "../src/lib/practice-comments/pagination";
import {
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
    ...extra,
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
  assert.doesNotMatch(LISTENER_IMPRESSION_PRIVACY, /дискомфорт|лечен|гарант|терап|исцел/i);
  assert.match(LISTENER_IMPRESSION_INVITE, /–/);
  assert.doesNotMatch(LISTENER_IMPRESSION_INVITE, /—/);
  assert.match(LISTENER_IMPRESSION_PRIVACY, /Фамилия и почта не показываются/);
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

  const migration = read("supabase/migrations/20270124120000_practice_listener_comments.sql");
  const service = read("src/lib/practice-comments/service.ts");
  assert.doesNotMatch(
    migration,
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
  assert.equal(restored.ok, true);
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
  const migration = read("supabase/migrations/20270124120000_practice_listener_comments.sql");
  assert.match(migration, /No email or SMS is sent from this table/);
  assert.equal(memoryId().length, 36);
}

await testPrivacyAndXss();
await testCreateListEditDelete();
await testProductGatesAndRatingsIsolation();
await testSpamPaginationAndAuthorReply();
await testReportModeration();
await testEmptyAndPlayerCopy();
console.log("practice-listener-comments-unit: ok");
