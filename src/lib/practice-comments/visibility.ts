import type { ListenerCommentRow } from "@/lib/practice-comments/types";

/**
 * Twin of SQL practice_listener_comment_row_visible.
 * Feed readers must use the same rules.
 */
export function isListenerCommentFeedVisible(input: {
  row: Pick<ListenerCommentRow, "userId" | "parentId" | "status" | "deletedAt">;
  viewerUserId: string | null;
  practiceAcceptsComments: boolean;
  parentPublished: boolean;
  viewerIsPracticeAuthor: boolean;
}): boolean {
  const { row } = input;
  if (row.status === "deleted" || row.deletedAt) {
    return false;
  }

  const publishedBranch =
    row.status === "published" &&
    input.practiceAcceptsComments &&
    (row.parentId == null || input.parentPublished);

  const ownBranch = input.viewerUserId != null && row.userId === input.viewerUserId;

  const authorBranch = row.status === "published" && input.viewerIsPracticeAuthor;

  return publishedBranch || ownBranch || authorBranch;
}
