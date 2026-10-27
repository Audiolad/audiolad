import type { ListenerCommentPracticeGate } from "@/lib/practice-comments/policy";
import type { CommentCursor, CommentSort } from "@/lib/practice-comments/pagination";
import type {
  CommentEditMark,
  CommentNoticeRow,
  CommentReportRow,
  ListenerCommentRow,
  ModerationEventRow,
  ReportReason,
} from "@/lib/practice-comments/types";

export type FeedCommentRow = {
  id: string;
  practiceId: string;
  parentId: string | null;
  kind: ListenerCommentRow["kind"];
  body: string;
  publicName: string;
  avatarUrl: string | null;
  status: "published" | "hidden";
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
};

export type PracticeContext = {
  id: string;
  title: string;
  authorSlug: string;
  productSlug: string;
};

export type CommentStore = {
  getGateBySlug(authorSlug: string, productSlug: string): Promise<ListenerCommentPracticeGate | null>;
  getPracticeContext(practiceId: string): Promise<PracticeContext | null>;
  suggestPublicName(userId: string): Promise<string>;
  viewerAvatarUrl(userId: string): Promise<string | null>;
  hasOwnImpression(userId: string, practiceId: string): Promise<boolean>;
  countPublishedImpressions(practiceId: string): Promise<number>;
  authorDisplayName(practiceId: string): Promise<string>;
  isAuthorMember(userId: string, practiceId: string): Promise<boolean>;
  authorRecipientIds(practiceId: string): Promise<string[]>;
  listAuthorPracticeIds(userId: string, authorId: string | null): Promise<string[]>;
  listFeed(input: {
    practiceId: string;
    viewerUserId: string | null;
    sort: CommentSort;
    cursor: CommentCursor | null;
    limit: number;
  }): Promise<FeedCommentRow[]>;
  listReplies(input: {
    practiceId: string;
    parentIds: string[];
    viewerUserId: string | null;
  }): Promise<FeedCommentRow[]>;
  getRaw(id: string): Promise<ListenerCommentRow | null>;
  feedAvatar(commentId: string): Promise<string | null>;
  findByRequest(userId: string, requestId: string): Promise<ListenerCommentRow | null>;
  countRecentImpressions(userId: string, sinceIso: string): Promise<number>;
  countRecentReplies(userId: string, sinceIso: string): Promise<number>;
  countRecentEdits(userId: string, sinceIso: string): Promise<number>;
  recordEdit(row: CommentEditMark): Promise<void>;
  insertCommentLimited(
    row: ListenerCommentRow,
    claim: CommentRateClaim,
  ): Promise<ListenerCommentRow | "rate_limited">;
  commitEditLimited(
    id: string,
    patch: CommentWritePatch,
    edit: CommentEditMark,
    claim: CommentRateClaim,
  ): Promise<ListenerCommentRow | "rate_limited">;
  insertReportLimited(
    row: CommentReportRow,
    claim: CommentRateClaim,
  ): Promise<"created" | "duplicate" | "rate_limited">;
  findRecentDuplicate(input: {
    userId: string;
    practiceId: string;
    fingerprint: string;
    sinceIso: string;
    exceptId?: string | null;
  }): Promise<ListenerCommentRow | null>;
  insertComment(row: ListenerCommentRow): Promise<ListenerCommentRow>;
  updateComment(
    id: string,
    patch: Partial<
      Pick<
        ListenerCommentRow,
        | "body"
        | "publicName"
        | "bodyFingerprint"
        | "status"
        | "updatedAt"
        | "editedAt"
        | "deletedAt"
        | "hiddenReason"
      >
    > & { hiddenBy?: string | null; hiddenAt?: string | null },
  ): Promise<ListenerCommentRow>;
  insertNotice(row: CommentNoticeRow): Promise<void>;
  listNotices(userId: string): Promise<
    Array<
      CommentNoticeRow & {
        practiceTitle: string;
        practiceHref: string;
        preview: string;
      }
    >
  >;
  markNoticeRead(userId: string, noticeId: string, readAt: string): Promise<boolean>;
  insertReport(row: CommentReportRow): Promise<"created" | "duplicate">;
  countRecentReports(userId: string, sinceIso: string): Promise<number>;
  listReports(commentId: string): Promise<CommentReportRow[]>;
  insertModerationEvent(row: ModerationEventRow): Promise<void>;
  listModerationEvents(commentId: string): Promise<ModerationEventRow[]>;
  /**
   * Platform-owner soft delete or return. The comment update and the journal
   * row commit together. A failed journal write leaves the comment unchanged.
   */
  applyOwnerModeration(input: {
    action: "owner_delete" | "owner_return";
    commentId: string;
    actorUserId: string;
    eventId: string;
    now: string;
  }): Promise<
    | { ok: true; previousStatus?: "published" | "hidden" }
    | { ok: false; error: "not_found" | "not_owner_deleted" }
  >;
  clearCommentNotices(commentId: string): Promise<void>;
  actorLabels(userIds: string[]): Promise<Record<string, string>>;
  listModerationQueue(input: {
    queue: "reports" | "hidden" | "deleted";
    cursor: CommentCursor | null;
    limit: number;
  }): Promise<ListenerCommentRow[]>;
};

export type CommentRateClaim = {
  sinceIso: string;
  limit: number;
};

export type CommentWritePatch = Partial<
  Pick<
    ListenerCommentRow,
    | "body"
    | "publicName"
    | "bodyFingerprint"
    | "status"
    | "updatedAt"
    | "editedAt"
    | "deletedAt"
    | "hiddenReason"
  >
> & { hiddenBy?: string | null; hiddenAt?: string | null };

export type NewCommentInput = {
  practiceId: string;
  userId: string;
  parentId: string | null;
  kind: ListenerCommentRow["kind"];
  body: string;
  publicName: string;
  clientRequestId: string | null;
  bodyFingerprint: string;
  createdAt: string;
};

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export type ReportInsert = {
  commentId: string;
  reporterUserId: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
};
