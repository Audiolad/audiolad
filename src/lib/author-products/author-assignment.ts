export type AuthorMemberWriteRole = "owner" | "editor";

export type PracticeAuthorAssignmentInput = {
  currentAuthorId: string;
  nextAuthorId: string;
  isSupportMode: boolean;
  actingAuthorId: string | null;
  realUserRoleOnNextAuthor: AuthorMemberWriteRole | null;
  actingUserRoleOnNextAuthor: AuthorMemberWriteRole | null;
};

export type PracticeAuthorAssignmentResult =
  | { ok: true; assign: boolean }
  | { ok: false; code: "forbidden" };

function isWriteRole(
  role: AuthorMemberWriteRole | null,
): role is AuthorMemberWriteRole {
  return role === "owner" || role === "editor";
}

/**
 * Decide whether a draft may keep or change practices.author_id.
 *
 * Unchanged author_id is already authorized by requirePracticeMutationAccess.
 * That path must not re-check author_members for auth.uid(): in support mode
 * the real platform owner is never added to author_members.
 *
 * A real author change still requires write membership of the actor who would
 * own the product: the signed-in user normally, the acting author in support
 * mode, and only inside that support scope.
 */
export function evaluatePracticeAuthorAssignment(
  input: PracticeAuthorAssignmentInput,
): PracticeAuthorAssignmentResult {
  const nextAuthorId = input.nextAuthorId.trim();
  const currentAuthorId = input.currentAuthorId.trim();

  if (!nextAuthorId || !currentAuthorId) {
    return { ok: false, code: "forbidden" };
  }

  if (nextAuthorId === currentAuthorId) {
    return { ok: true, assign: false };
  }

  if (input.isSupportMode) {
    if (!input.actingAuthorId || input.actingAuthorId !== nextAuthorId) {
      return { ok: false, code: "forbidden" };
    }

    if (!isWriteRole(input.actingUserRoleOnNextAuthor)) {
      return { ok: false, code: "forbidden" };
    }

    return { ok: true, assign: true };
  }

  if (!isWriteRole(input.realUserRoleOnNextAuthor)) {
    return { ok: false, code: "forbidden" };
  }

  return { ok: true, assign: true };
}
