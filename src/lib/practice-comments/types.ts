export const REPORT_REASONS = ["spam", "insult", "personal_data", "other"] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export type CommentKind = "impression" | "author_reply";

export type CommentStatus = "published" | "hidden" | "deleted";

export type ListenerCommentRow = {
  id: string;
  practiceId: string;
  userId: string;
  parentId: string | null;
  kind: CommentKind;
  body: string;
  publicName: string;
  status: CommentStatus;
  clientRequestId: string | null;
  bodyFingerprint: string;
  hiddenReason: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type CommentNoticeKind = "new_impression" | "author_reply";

export type CommentNoticeRow = {
  id: string;
  recipientUserId: string;
  commentId: string;
  practiceId: string;
  kind: CommentNoticeKind;
  readAt: string | null;
  createdAt: string;
};

export type CommentReportRow = {
  id: string;
  commentId: string;
  reporterUserId: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
};

export type ModerationAction = "hide" | "restore" | "report";

export type ModerationEventRow = {
  id: string;
  commentId: string;
  actorUserId: string;
  action: ModerationAction;
  reason: string | null;
  createdAt: string;
};

export type PublicReplyDto = {
  id: string;
  body: string;
  publicName: string;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
};

export type PublicCommentDto = {
  id: string;
  body: string;
  publicName: string;
  createdAt: string;
  editedAt: string | null;
  status: "published" | "hidden";
  mine: boolean;
  reply: PublicReplyDto | null;
};

export type CommentFailure = {
  ok: false;
  status: number;
  error: string;
};

export function commentFailure(status: number, error: string): CommentFailure {
  return { ok: false, status, error };
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}
