import { randomUUID } from "node:crypto";

import { resolveListenerAvatarUrl, resolveViewerCommentAvatar } from "@/lib/practice-comments/avatar";
import { compareComments, isAfterCursor } from "@/lib/practice-comments/pagination";
import { practiceAcceptsListenerComments } from "@/lib/practice-comments/policy";
import { isListenerCommentFeedVisible } from "@/lib/practice-comments/visibility";
import type { ListenerCommentPracticeGate } from "@/lib/practice-comments/policy";
import type { CommentStore, FeedCommentRow } from "@/lib/practice-comments/store";
import type {
  CommentEditMark,
  CommentNoticeRow,
  CommentReportRow,
  ListenerCommentRow,
  ModerationEventRow,
} from "@/lib/practice-comments/types";

const rateLocks = new Map<string, Promise<unknown>>();

function withRateLock<T>(key: string, work: () => Promise<T> | T): Promise<T> {
  const previous = rateLocks.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  rateLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export type MemoryCommentState = {
  gates: ListenerCommentPracticeGate[];
  memberships: Array<{ userId: string; practiceId: string; authorId: string }>;
  names: Record<string, string>;
  authorNames: Record<string, string>;
  comments: ListenerCommentRow[];
  profileAvatars?: Record<string, { url?: string | null; path?: string | null; fullName?: string | null }>;
  authorAvatars?: Record<string, { url?: string | null; name?: string | null }>;
  notices: CommentNoticeRow[];
  reports: CommentReportRow[];
  events: ModerationEventRow[];
  edits: CommentEditMark[];
};

export function createMemoryCommentStore(state: MemoryCommentState): CommentStore {
  const hiddenMeta = new Map<string, { hiddenBy: string | null; hiddenAt: string | null }>();

  function gateFor(practiceId: string) {
    return state.gates.find((gate) => gate.practiceId === practiceId) ?? null;
  }

  function parentPublished(parentId: string | null) {
    if (!parentId) return true;
    const parent = state.comments.find((row) => row.id === parentId);
    return Boolean(parent && parent.status === "published" && !parent.deletedAt);
  }

  function toFeed(row: ListenerCommentRow, viewerUserId: string | null): FeedCommentRow | null {
    const gate = gateFor(row.practiceId);
    const visible = isListenerCommentFeedVisible({
      row,
      viewerUserId,
      practiceAcceptsComments: gate
        ? practiceAcceptsListenerComments({
            productKind: gate.productKind,
            catalogSection: gate.catalogSection,
            status: gate.status,
            publishedAt: gate.publishedAt,
            scheduledPublishAt: gate.scheduledPublishAt,
            deletedAt: gate.deletedAt,
          })
        : false,
      parentPublished: parentPublished(row.parentId),
      viewerIsPracticeAuthor: state.memberships.some(
        (member) => member.userId === viewerUserId && member.practiceId === row.practiceId,
      ),
    });
    if (!visible || row.status === "deleted") return null;
    return {
      id: row.id,
      practiceId: row.practiceId,
      parentId: row.parentId,
      kind: row.kind,
      body: row.body,
      publicName: row.publicName,
      avatarUrl: avatarFor(row),
      status: row.status === "hidden" ? "hidden" : "published",
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      mine: viewerUserId != null && row.userId === viewerUserId,
    };
  }

  function avatarFor(row: ListenerCommentRow): string | null {
    const profile = state.profileAvatars?.[row.userId];
    const author = state.authorAvatars?.[row.practiceId];
    return resolveListenerAvatarUrl({
      commentId: row.id,
      kind: row.kind,
      userId: row.userId,
      profileUrl: profile?.url,
      profilePath: profile?.path,
      profileFullName: profile?.fullName,
      authorUrl: author?.url,
      authorName: author?.name,
    });
  }

  return {
    async getGateBySlug(authorSlug, productSlug) {
      return (
        state.gates.find(
          (gate) => gate.authorSlug === authorSlug && gate.productSlug === productSlug,
        ) ?? null
      );
    },
    async getPracticeContext(practiceId) {
      const gate = gateFor(practiceId);
      if (!gate) return null;
      return {
        id: gate.practiceId,
        title: gate.title,
        authorSlug: gate.authorSlug,
        productSlug: gate.productSlug,
      };
    },
    async suggestPublicName(userId) {
      return state.names[userId] ?? "Слушатель";
    },
    async viewerAvatarUrl(userId) {
      const profile = state.profileAvatars?.[userId];
      if (!profile) return null;
      return resolveViewerCommentAvatar({
        userId,
        profileUrl: profile.url,
        profilePath: profile.path,
        profileFullName: profile.fullName,
      });
    },
    async authorDisplayName(practiceId) {
      return state.authorNames[practiceId] ?? "Автор";
    },
    async isAuthorMember(userId, practiceId) {
      return state.memberships.some(
        (member) => member.userId === userId && member.practiceId === practiceId,
      );
    },
    async authorRecipientIds(practiceId) {
      return state.memberships
        .filter((member) => member.practiceId === practiceId)
        .map((member) => member.userId);
    },
    async listAuthorPracticeIds(userId, authorId) {
      return state.memberships
        .filter(
          (member) =>
            member.userId === userId && (authorId == null || member.authorId === authorId),
        )
        .map((member) => member.practiceId);
    },
    async listFeed(input) {
      return state.comments
        .filter((row) => row.practiceId === input.practiceId && row.kind === "impression")
        .map((row) => toFeed(row, input.viewerUserId))
        .filter((row): row is FeedCommentRow => row != null)
        .filter((row) => (input.cursor ? isAfterCursor(input.sort, row, input.cursor) : true))
        .sort((left, right) => compareComments(input.sort, left, right))
        .slice(0, input.limit);
    },
    async listReplies(input) {
      const parents = new Set(input.parentIds);
      return state.comments
        .filter(
          (row) =>
            row.practiceId === input.practiceId &&
            row.kind === "author_reply" &&
            row.parentId != null &&
            parents.has(row.parentId),
        )
        .map((row) => toFeed(row, input.viewerUserId))
        .filter((row): row is FeedCommentRow => row != null);
    },
    async getRaw(id) {
      return state.comments.find((row) => row.id === id) ?? null;
    },
    async feedAvatar(commentId) {
      const row = state.comments.find((item) => item.id === commentId);
      return row ? avatarFor(row) : null;
    },
    async findByRequest(userId, requestId) {
      return (
        state.comments.find(
          (row) => row.userId === userId && row.clientRequestId === requestId,
        ) ?? null
      );
    },
    async countRecentImpressions(userId, sinceIso) {
      return state.comments.filter(
        (row) =>
          row.userId === userId &&
          row.kind === "impression" &&
          row.status !== "deleted" &&
          row.createdAt >= sinceIso,
      ).length;
    },
    async countRecentReplies(userId, sinceIso) {
      return state.comments.filter(
        (row) => row.userId === userId && row.kind === "author_reply" && row.createdAt >= sinceIso,
      ).length;
    },
    async countRecentEdits(userId, sinceIso) {
      return state.edits.filter((row) => row.userId === userId && row.createdAt >= sinceIso).length;
    },
    async recordEdit(row) {
      state.edits.push(row);
    },
    async insertCommentLimited(row, claim) {
      const bucket = row.kind === "author_reply" ? "reply" : "impression";
      return withRateLock(`${row.userId}:${bucket}`, async () => {
        const count =
          bucket === "reply"
            ? state.comments.filter(
                (item) => item.userId === row.userId && item.kind === "author_reply" && item.createdAt >= claim.sinceIso,
              ).length
            : state.comments.filter(
                (item) =>
                  item.userId === row.userId &&
                  item.kind === "impression" &&
                  item.status !== "deleted" &&
                  item.createdAt >= claim.sinceIso,
              ).length;
        if (count >= claim.limit) return "rate_limited" as const;
        return this.insertComment(row);
      });
    },
    async commitEditLimited(id, patch, edit, claim) {
      return withRateLock(`${edit.userId}:edit`, async () => {
        const count = state.edits.filter(
          (item) => item.userId === edit.userId && item.createdAt >= claim.sinceIso,
        ).length;
        if (count >= claim.limit) return "rate_limited" as const;
        const updated = await this.updateComment(id, patch);
        state.edits.push(edit);
        return updated;
      });
    },
    async insertReportLimited(row, claim) {
      return withRateLock(`${row.reporterUserId}:report`, async () => {
        const count = state.reports.filter(
          (item) => item.reporterUserId === row.reporterUserId && item.createdAt >= claim.sinceIso,
        ).length;
        if (count >= claim.limit) return "rate_limited" as const;
        return this.insertReport(row);
      });
    },
    async findRecentDuplicate(input) {
      return (
        state.comments.find(
          (row) =>
            row.userId === input.userId &&
            row.practiceId === input.practiceId &&
            row.kind === "impression" &&
            row.status !== "deleted" &&
            row.bodyFingerprint === input.fingerprint &&
            row.createdAt >= input.sinceIso &&
            row.id !== input.exceptId,
        ) ?? null
      );
    },
    async insertComment(row) {
      if (
        row.clientRequestId &&
        state.comments.some(
          (existing) =>
            existing.userId === row.userId && existing.clientRequestId === row.clientRequestId,
        )
      ) {
        const error = new Error("duplicate") as Error & { code: string };
        error.code = "23505";
        throw error;
      }
      if (
        row.kind === "author_reply" &&
        row.parentId &&
        state.comments.some(
          (existing) =>
            existing.parentId === row.parentId &&
            existing.kind === "author_reply" &&
            existing.status !== "deleted",
        )
      ) {
        const error = new Error("duplicate reply") as Error & { code: string };
        error.code = "23505";
        throw error;
      }
      state.comments.push(row);
      return row;
    },
    async updateComment(id, patch) {
      const row = state.comments.find((item) => item.id === id);
      if (!row) throw new Error("missing_comment");
      Object.assign(row, patch);
      if ("hiddenBy" in patch || "hiddenAt" in patch) {
        hiddenMeta.set(id, {
          hiddenBy: patch.hiddenBy ?? null,
          hiddenAt: patch.hiddenAt ?? null,
        });
      }
      return row;
    },
    async insertNotice(row) {
      const existing = state.notices.find(
        (notice) =>
          notice.recipientUserId === row.recipientUserId &&
          notice.commentId === row.commentId &&
          notice.kind === row.kind,
      );
      if (!existing) state.notices.push(row);
    },
    async listNotices(userId) {
      return state.notices
        .filter((notice) => notice.recipientUserId === userId)
        .map((notice) => {
          const gate = gateFor(notice.practiceId);
          const comment = state.comments.find((row) => row.id === notice.commentId);
          return {
            ...notice,
            practiceTitle: gate?.title ?? "Практика",
            practiceHref: gate ? `/practice/${gate.authorSlug}/${gate.productSlug}#listener-impressions` : "/catalog",
            preview: comment?.body.slice(0, 140) ?? "",
          };
        });
    },
    async markNoticeRead(userId, noticeId, readAt) {
      const notice = state.notices.find(
        (item) => item.id === noticeId && item.recipientUserId === userId,
      );
      if (!notice) return false;
      notice.readAt = readAt;
      return true;
    },
    async insertReport(row) {
      const exists = state.reports.some(
        (report) =>
          report.commentId === row.commentId && report.reporterUserId === row.reporterUserId,
      );
      if (exists) return "duplicate";
      state.reports.push(row);
      return "created";
    },
    async countRecentReports(userId, sinceIso) {
      return state.reports.filter(
        (report) => report.reporterUserId === userId && report.createdAt >= sinceIso,
      ).length;
    },
    async listReports(commentId) {
      return state.reports.filter((report) => report.commentId === commentId);
    },
    async insertModerationEvent(row) {
      state.events.push(row);
    },
    async listModerationEvents(commentId) {
      return state.events.filter((event) => event.commentId === commentId);
    },
    async listModerationQueue(input) {
      const matched = state.comments.filter((row) => {
        if (row.status === "deleted") return false;
        if (input.queue === "hidden") return row.status === "hidden";
        return (
          row.status === "published" &&
          state.reports.some((report) => report.commentId === row.id)
        );
      });
      return matched
        .filter((row) => (input.cursor ? isAfterCursor("new", row, input.cursor) : true))
        .sort((left, right) => compareComments("new", left, right))
        .slice(0, input.limit);
    },
  };
}

export function memoryId(): string {
  return randomUUID();
}
