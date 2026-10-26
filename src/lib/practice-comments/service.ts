import { randomUUID } from "node:crypto";

import { buildPracticePublicPath } from "@/lib/products/paths";
import { LISTENER_COMMENT_DEFAULT_PUBLIC_NAME } from "@/lib/practice-comments/copy";
import {
  encodeCommentCursor,
  type CommentCursor,
  type CommentSort,
} from "@/lib/practice-comments/pagination";
import { practiceAcceptsListenerComments } from "@/lib/practice-comments/policy";
import type { CommentStore, FeedCommentRow } from "@/lib/practice-comments/store";
import { isUniqueViolation } from "@/lib/practice-comments/store";
import {
  commentFingerprint,
  deriveDefaultPublicName,
  parseClientRequestId,
  parseCommentBody,
  parseAuthorReplyName,
  parsePublicCommentName,
  parseReportDetails,
} from "@/lib/practice-comments/text";
import {
  commentFailure,
  isReportReason,
  type CommentFailure,
  type CommentNoticeRow,
  type ListenerCommentRow,
  type ModerationEventRow,
  type PublicCommentDto,
  type PublicReplyDto,
} from "@/lib/practice-comments/types";

export const COMMENT_CREATE_LIMIT = 6;
export const COMMENT_CREATE_WINDOW_MS = 10 * 60 * 1000;
export const COMMENT_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const COMMENT_REPORT_LIMIT = 10;
export const COMMENT_REPORT_WINDOW_MS = 60 * 60 * 1000;
export const COMMENT_REPLY_LIMIT = 20;
export const COMMENT_REPLY_WINDOW_MS = 60 * 60 * 1000;

export type CommentActor = {
  userId: string | null;
  isModerator: boolean;
};

export type CommentClock = {
  now: () => Date;
  rateLimit: (key: string, limit: number, windowMs: number) => boolean;
};

function iso(date: Date): string {
  return date.toISOString();
}

function minus(now: Date, windowMs: number): string {
  return new Date(now.getTime() - windowMs).toISOString();
}

function toReply(row: FeedCommentRow): PublicReplyDto {
  return {
    id: row.id,
    body: row.body,
    publicName: row.publicName,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    mine: row.mine,
  };
}

function toDto(row: FeedCommentRow, reply: FeedCommentRow | null): PublicCommentDto | null {
  if (row.kind !== "impression") return null;
  if (row.status === "hidden" && !row.mine) return null;
  const visibleReply =
    reply && (reply.status === "published" || reply.mine) ? toReply(reply) : null;
  return {
    id: row.id,
    body: row.body,
    publicName: row.publicName,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    status: row.status,
    mine: row.mine,
    reply: visibleReply,
  };
}

function projectFeed(rows: FeedCommentRow[], replies: FeedCommentRow[]): PublicCommentDto[] {
  const replyByParent = new Map<string, FeedCommentRow>();
  for (const reply of replies) {
    if (reply.parentId && reply.status !== "hidden") {
      replyByParent.set(reply.parentId, reply);
    } else if (reply.parentId && reply.mine) {
      replyByParent.set(reply.parentId, reply);
    }
  }
  return rows
    .map((row) => toDto(row, row.id ? replyByParent.get(row.id) ?? null : null))
    .filter((row): row is PublicCommentDto => row != null);
}

function rawToPublic(row: ListenerCommentRow, mine: boolean): PublicCommentDto {
  return {
    id: row.id,
    body: row.body,
    publicName: row.publicName,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    status: row.status === "hidden" ? "hidden" : "published",
    mine,
    reply: null,
  };
}

async function attachReply(
  store: CommentStore,
  impression: ListenerCommentRow,
): Promise<PublicCommentDto> {
  const replies = await store.listReplies({
    practiceId: impression.practiceId,
    parentIds: [impression.id],
    viewerUserId: impression.userId,
  });
  const dto = rawToPublic(impression, true);
  const reply = replies.find((item) => item.parentId === impression.id && item.status === "published");
  dto.reply = reply ? toReply(reply) : null;
  return dto;
}

export async function listPracticeComments(
  store: CommentStore,
  actor: CommentActor,
  input: {
    authorSlug: string;
    productSlug: string;
    sort: CommentSort;
    cursor: CommentCursor | null;
    limit: number;
    now?: Date;
  },
): Promise<
  | CommentFailure
  | {
      ok: true;
      comments: PublicCommentDto[];
      nextCursor: string | null;
      viewer: {
        authenticated: boolean;
        canComment: boolean;
        canReply: boolean;
        publicNameSuggestion: string;
      };
    }
> {
  const gate = await store.getGateBySlug(input.authorSlug, input.productSlug);
  if (!gate) return commentFailure(404, "not_found");
  const accepts = practiceAcceptsListenerComments({ ...gate, now: input.now });
  if (!accepts) {
    return commentFailure(
      gate.productKind === "music" || gate.productKind === "audio_post" || gate.catalogSection === "music"
        ? 403
        : 404,
      gate.productKind === "music" || gate.productKind === "audio_post" || gate.catalogSection === "music"
        ? "product_not_commentable"
        : "not_found",
    );
  }

  const page = await store.listFeed({
    practiceId: gate.practiceId,
    viewerUserId: actor.userId,
    sort: input.sort,
    cursor: input.cursor,
    limit: input.limit + 1,
  });
  const hasMore = page.length > input.limit;
  const impressions = page.filter((row) => row.kind === "impression").slice(0, input.limit);
  const replies = await store.listReplies({
    practiceId: gate.practiceId,
    parentIds: impressions.map((row) => row.id),
    viewerUserId: actor.userId,
  });
  const last = impressions[impressions.length - 1];
  const canReply = actor.userId
    ? await store.isAuthorMember(actor.userId, gate.practiceId)
    : false;
  return {
    ok: true,
    comments: projectFeed(impressions, replies),
    nextCursor: hasMore && last ? encodeCommentCursor(last) : null,
    viewer: {
      authenticated: Boolean(actor.userId),
      canComment: Boolean(actor.userId),
      canReply,
      publicNameSuggestion: actor.userId
        ? await store.suggestPublicName(actor.userId)
        : LISTENER_COMMENT_DEFAULT_PUBLIC_NAME,
    },
  };
}

async function notify(
  store: CommentStore,
  input: Omit<CommentNoticeRow, "id" | "readAt">,
): Promise<void> {
  await store.insertNotice({ ...input, id: randomUUID(), readAt: null });
}

export async function createImpression(
  store: CommentStore,
  actor: CommentActor,
  clock: CommentClock,
  input: {
    authorSlug: string;
    productSlug: string;
    body: unknown;
    publicName: unknown;
    clientRequestId: unknown;
  },
): Promise<CommentFailure | { ok: true; comment: PublicCommentDto; replayed: boolean }> {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  const gate = await store.getGateBySlug(input.authorSlug, input.productSlug);
  if (!gate) return commentFailure(404, "not_found");
  if (!practiceAcceptsListenerComments({ ...gate, now: clock.now() })) {
    const blockedKind =
      gate.productKind === "music" ||
      gate.productKind === "audio_post" ||
      gate.catalogSection === "music";
    return commentFailure(blockedKind ? 403 : 404, blockedKind ? "product_not_commentable" : "not_found");
  }
  const body = parseCommentBody(input.body);
  if (!body.ok) return commentFailure(400, body.error);
  const requestId = parseClientRequestId(input.clientRequestId);
  if (!requestId.ok) return commentFailure(400, requestId.error);
  const suggested = await store.suggestPublicName(actor.userId);
  const publicName =
    input.publicName == null || input.publicName === ""
      ? parsePublicCommentName(suggested || deriveDefaultPublicName(null))
      : parsePublicCommentName(input.publicName);
  if (!publicName.ok) return commentFailure(400, publicName.error);

  if (requestId.value) {
    const existing = await store.findByRequest(actor.userId, requestId.value);
    if (existing) {
      if (
        existing.practiceId !== gate.practiceId ||
        existing.bodyFingerprint !== commentFingerprint(body.value)
      ) {
        return commentFailure(409, "idempotency_conflict");
      }
      return { ok: true, comment: await attachReply(store, existing), replayed: true };
    }
  }

  if (!clock.rateLimit(`listener-comment:create:${actor.userId}`, COMMENT_CREATE_LIMIT, COMMENT_CREATE_WINDOW_MS)) {
    return commentFailure(429, "rate_limited");
  }
  const now = clock.now();
  const recent = await store.countRecentImpressions(
    actor.userId,
    minus(now, COMMENT_CREATE_WINDOW_MS),
  );
  if (recent >= COMMENT_CREATE_LIMIT) return commentFailure(429, "rate_limited");

  const fingerprint = commentFingerprint(body.value);
  const duplicate = await store.findRecentDuplicate({
    userId: actor.userId,
    practiceId: gate.practiceId,
    fingerprint,
    sinceIso: minus(now, COMMENT_DUPLICATE_WINDOW_MS),
  });
  if (duplicate) return commentFailure(409, "duplicate_comment");

  const row: ListenerCommentRow = {
    id: randomUUID(),
    practiceId: gate.practiceId,
    userId: actor.userId,
    parentId: null,
    kind: "impression",
    body: body.value,
    publicName: publicName.value,
    status: "published",
    clientRequestId: requestId.value,
    bodyFingerprint: fingerprint,
    hiddenReason: null,
    createdAt: iso(now),
    updatedAt: iso(now),
    editedAt: null,
    deletedAt: null,
  };

  try {
    await store.insertComment(row);
  } catch (error) {
    if (isUniqueViolation(error) && requestId.value) {
      const existing = await store.findByRequest(actor.userId, requestId.value);
      if (existing) return { ok: true, comment: await attachReply(store, existing), replayed: true };
    }
    throw error;
  }

  const recipients = await store.authorRecipientIds(gate.practiceId);
  for (const recipientUserId of recipients) {
    if (recipientUserId === actor.userId) continue;
    await notify(store, {
      recipientUserId,
      commentId: row.id,
      practiceId: gate.practiceId,
      kind: "new_impression",
      createdAt: row.createdAt,
    });
  }

  return { ok: true, comment: rawToPublic(row, true), replayed: false };
}

export async function updateOwnComment(
  store: CommentStore,
  actor: CommentActor,
  clock: CommentClock,
  input: { commentId: string; body: unknown; publicName?: unknown },
): Promise<CommentFailure | { ok: true; comment: PublicCommentDto }> {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  const row = await store.getRaw(input.commentId);
  if (!row || row.status === "deleted") return commentFailure(404, "not_found");
  if (row.userId !== actor.userId) return commentFailure(403, "forbidden");
  if (row.status === "hidden") return commentFailure(403, "comment_hidden");
  const body = parseCommentBody(input.body);
  if (!body.ok) return commentFailure(400, body.error);
  const fingerprint = commentFingerprint(body.value);
  if (row.kind === "impression") {
    const duplicate = await store.findRecentDuplicate({
      userId: actor.userId,
      practiceId: row.practiceId,
      fingerprint,
      sinceIso: minus(clock.now(), COMMENT_DUPLICATE_WINDOW_MS),
      exceptId: row.id,
    });
    if (duplicate) return commentFailure(409, "duplicate_comment");
  }
  let publicName = row.publicName;
  if (row.kind === "impression" && input.publicName != null && input.publicName !== "") {
    const parsed = parsePublicCommentName(input.publicName);
    if (!parsed.ok) return commentFailure(400, parsed.error);
    publicName = parsed.value;
  }
  const now = iso(clock.now());
  const updated = await store.updateComment(row.id, {
    body: body.value,
    publicName,
    bodyFingerprint: fingerprint,
    updatedAt: now,
    editedAt: now,
  });
  return { ok: true, comment: await attachReply(store, updated) };
}

export async function deleteOwnComment(
  store: CommentStore,
  actor: CommentActor,
  clock: CommentClock,
  commentId: string,
): Promise<CommentFailure | { ok: true }> {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  const row = await store.getRaw(commentId);
  if (!row || row.status === "deleted") return commentFailure(404, "not_found");
  if (row.kind === "impression") {
    if (row.userId !== actor.userId) {
      return commentFailure(403, "author_cannot_delete_impression");
    }
  } else if (row.userId !== actor.userId) {
    const author = await store.isAuthorMember(actor.userId, row.practiceId);
    if (!author) return commentFailure(403, "forbidden");
  }
  const now = iso(clock.now());
  await store.updateComment(row.id, {
    status: "deleted",
    deletedAt: now,
    updatedAt: now,
  });
  return { ok: true };
}

export async function replyAsAuthor(
  store: CommentStore,
  actor: CommentActor,
  clock: CommentClock,
  input: { commentId: string; body: unknown; clientRequestId: unknown },
): Promise<CommentFailure | { ok: true; comment: PublicCommentDto; replayed: boolean }> {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  const parent = await store.getRaw(input.commentId);
  if (!parent || parent.status === "deleted" || parent.kind !== "impression") {
    return commentFailure(404, "not_found");
  }
  if (parent.status !== "published") return commentFailure(403, "comment_hidden");
  const member = await store.isAuthorMember(actor.userId, parent.practiceId);
  if (!member) return commentFailure(403, "forbidden");
  const body = parseCommentBody(input.body);
  if (!body.ok) return commentFailure(400, body.error);
  const requestId = parseClientRequestId(input.clientRequestId);
  if (!requestId.ok) return commentFailure(400, requestId.error);
  if (requestId.value) {
    const existing = await store.findByRequest(actor.userId, requestId.value);
    if (existing && existing.parentId === parent.id) {
      return { ok: true, comment: await attachReply(store, parent), replayed: true };
    }
  }
  if (!clock.rateLimit(`listener-comment:reply:${actor.userId}`, COMMENT_REPLY_LIMIT, COMMENT_REPLY_WINDOW_MS)) {
    return commentFailure(429, "rate_limited");
  }
  const now = clock.now();
  const row: ListenerCommentRow = {
    id: randomUUID(),
    practiceId: parent.practiceId,
    userId: actor.userId,
    parentId: parent.id,
    kind: "author_reply",
    body: body.value,
    publicName: parseAuthorReplyName(await store.authorDisplayName(parent.practiceId)),
    status: "published",
    clientRequestId: requestId.value,
    bodyFingerprint: commentFingerprint(body.value),
    hiddenReason: null,
    createdAt: iso(now),
    updatedAt: iso(now),
    editedAt: null,
    deletedAt: null,
  };
  try {
    await store.insertComment(row);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { ok: true, comment: await attachReply(store, parent), replayed: true };
  }
  if (parent.userId !== actor.userId) {
    await notify(store, {
      recipientUserId: parent.userId,
      commentId: row.id,
      practiceId: parent.practiceId,
      kind: "author_reply",
      createdAt: row.createdAt,
    });
  }
  return { ok: true, comment: await attachReply(store, parent), replayed: false };
}

export async function reportComment(
  store: CommentStore,
  actor: CommentActor,
  clock: CommentClock,
  input: { commentId: string; reason: unknown; details: unknown },
): Promise<CommentFailure | { ok: true; duplicate: boolean }> {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  if (!isReportReason(input.reason)) return commentFailure(400, "invalid_report");
  const details = parseReportDetails(input.details);
  if (!details.ok) return commentFailure(400, details.error);
  const row = await store.getRaw(input.commentId);
  if (!row || row.status !== "published") return commentFailure(404, "not_found");
  if (row.userId === actor.userId) return commentFailure(403, "forbidden");
  if (!clock.rateLimit(`listener-comment:report:${actor.userId}`, COMMENT_REPORT_LIMIT, COMMENT_REPORT_WINDOW_MS)) {
    return commentFailure(429, "rate_limited");
  }
  const recent = await store.countRecentReports(actor.userId, minus(clock.now(), COMMENT_REPORT_WINDOW_MS));
  if (recent >= COMMENT_REPORT_LIMIT) return commentFailure(429, "rate_limited");
  const createdAt = iso(clock.now());
  const result = await store.insertReport({
    id: randomUUID(),
    commentId: row.id,
    reporterUserId: actor.userId,
    reason: input.reason,
    details: details.value,
    createdAt,
  });
  if (result === "created") {
    const event: ModerationEventRow = {
      id: randomUUID(),
      commentId: row.id,
      actorUserId: actor.userId,
      action: "report",
      reason: input.reason,
      createdAt,
    };
    await store.insertModerationEvent(event);
  }
  return { ok: true, duplicate: result === "duplicate" };
}

export async function listAuthorFeedback(
  store: CommentStore,
  actor: CommentActor,
  input: {
    authorId: string | null;
    sort: CommentSort;
    cursor: CommentCursor | null;
    limit: number;
  },
): Promise<
  | CommentFailure
  | {
      ok: true;
      comments: Array<{
        id: string;
        practiceId: string;
        practiceTitle: string;
        practiceHref: string;
        publicName: string;
        body: string;
        createdAt: string;
        editedAt: string | null;
        reply: PublicReplyDto | null;
        noticeId: string | null;
        unread: boolean;
      }>;
      nextCursor: string | null;
    }
> {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  const practiceIds = await store.listAuthorPracticeIds(actor.userId, input.authorId);
  if (input.authorId && practiceIds.length === 0) return commentFailure(403, "forbidden");
  const collected: FeedCommentRow[] = [];
  for (const practiceId of practiceIds) {
    const rows = await store.listFeed({
      practiceId,
      viewerUserId: actor.userId,
      sort: input.sort,
      cursor: input.cursor,
      limit: input.limit + 1,
    });
    collected.push(...rows.filter((row) => row.status === "published" && row.kind === "impression"));
  }
  collected.sort((left, right) =>
    left.createdAt < right.createdAt ? (input.sort === "old" ? -1 : 1) : left.createdAt > right.createdAt ? (input.sort === "old" ? 1 : -1) : 0,
  );
  const page = collected.slice(0, input.limit);
  const notices = await store.listNotices(actor.userId);
  const comments = [];
  for (const row of page) {
    const context = await store.getPracticeContext(row.practiceId);
    const replies = await store.listReplies({
      practiceId: row.practiceId,
      parentIds: [row.id],
      viewerUserId: actor.userId,
    });
    const reply = replies.find((item) => item.status === "published") ?? null;
    const notice = notices.find(
      (item) => item.commentId === row.id && item.kind === "new_impression",
    );
    comments.push({
      id: row.id,
      practiceId: row.practiceId,
      practiceTitle: context?.title ?? "Практика",
      practiceHref: context
        ? `${buildPracticePublicPath(context.authorSlug, context.productSlug)}#listener-impressions`
        : "/catalog",
      publicName: row.publicName,
      body: row.body,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      reply: reply ? toReply(reply) : null,
      noticeId: notice?.id ?? null,
      unread: Boolean(notice && !notice.readAt),
    });
  }
  const last = page[page.length - 1];
  return {
    ok: true,
    comments,
    nextCursor: collected.length > input.limit && last ? encodeCommentCursor(last) : null,
  };
}

export async function listListenerNotices(store: CommentStore, actor: CommentActor) {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  const notices = await store.listNotices(actor.userId);
  return {
    ok: true as const,
    notices: notices
      .filter((notice) => notice.kind === "author_reply")
      .map((notice) => ({
        id: notice.id,
        practiceTitle: notice.practiceTitle,
        practiceHref: notice.practiceHref,
        preview: notice.preview,
        createdAt: notice.createdAt,
        unread: notice.readAt == null,
      })),
  };
}

export async function markCommentNoticeRead(
  store: CommentStore,
  actor: CommentActor,
  clock: CommentClock,
  noticeId: string,
) {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  const ok = await store.markNoticeRead(actor.userId, noticeId, iso(clock.now()));
  if (!ok) return commentFailure(404, "not_found");
  return { ok: true as const };
}

export async function moderateComment(
  store: CommentStore,
  actor: CommentActor,
  clock: CommentClock,
  input: { commentId: string; action: "hide" | "restore"; reason: unknown },
): Promise<CommentFailure | { ok: true }> {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  if (!actor.isModerator) return commentFailure(403, "forbidden");
  const row = await store.getRaw(input.commentId);
  if (!row || row.status === "deleted") return commentFailure(404, "not_found");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (input.action === "hide") {
    if (!isReportReason(reason) && reason.length < 2) return commentFailure(400, "invalid_reason");
    if (reason.length > 200 || /[<>]/.test(reason)) return commentFailure(400, "invalid_reason");
    const now = iso(clock.now());
    await store.updateComment(row.id, {
      status: "hidden",
      hiddenReason: reason,
      hiddenBy: actor.userId,
      hiddenAt: now,
      updatedAt: now,
    });
    await store.insertModerationEvent({
      id: randomUUID(),
      commentId: row.id,
      actorUserId: actor.userId,
      action: "hide",
      reason,
      createdAt: now,
    });
    return { ok: true };
  }
  if (row.status !== "hidden") return commentFailure(409, "not_hidden");
  const now = iso(clock.now());
  await store.updateComment(row.id, {
    status: "published",
    hiddenReason: null,
    hiddenBy: null,
    hiddenAt: null,
    updatedAt: now,
  });
  await store.insertModerationEvent({
    id: randomUUID(),
    commentId: row.id,
    actorUserId: actor.userId,
    action: "restore",
    reason: reason || null,
    createdAt: now,
  });
  return { ok: true };
}

export async function listModerationQueue(
  store: CommentStore,
  actor: CommentActor,
  input: { queue: "reports" | "hidden"; cursor: CommentCursor | null; limit: number },
) {
  if (!actor.userId) return commentFailure(401, "unauthorized");
  if (!actor.isModerator) return commentFailure(403, "forbidden");
  const rows = await store.listModerationQueue({
    queue: input.queue,
    cursor: input.cursor,
    limit: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  const items = [];
  for (const row of page) {
    const context = await store.getPracticeContext(row.practiceId);
    const reports = await store.listReports(row.id);
    const journal = await store.listModerationEvents(row.id);
    items.push({
      id: row.id,
      practiceTitle: context?.title ?? "Практика",
      publicName: row.publicName,
      body: row.body,
      status: row.status === "hidden" ? "hidden" : "published",
      kind: row.kind,
      createdAt: row.createdAt,
      reports: reports.map((report) => ({
        reason: report.reason,
        createdAt: report.createdAt,
      })),
      journal: journal.map((event) => ({
        action: event.action,
        reason: event.reason,
        createdAt: event.createdAt,
      })),
    });
  }
  const last = page[page.length - 1];
  return {
    ok: true as const,
    items,
    nextCursor: rows.length > input.limit && last ? encodeCommentCursor(last) : null,
  };
}
