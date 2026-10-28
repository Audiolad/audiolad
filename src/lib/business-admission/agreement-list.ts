/** Read-side filter. The source of truth is a verified rightsholder check, not the agreement acceptance. */

export const BUSINESS_AGREEMENT_LIST_HINT = "В списке только авторы с подтверждёнными правами";

/** Account-level: status verified on business_rightsholder_verifications covers every workspace that user owns. */
export function authorIdsWithVerifiedRights(
  verifications: readonly { owner_user_id: string; status: string }[],
  memberships: readonly { user_id: string; author_id: string; role: string }[],
): Set<string> {
  const owners = new Set(verifications.filter((row) => row.status === "verified").map((row) => row.owner_user_id));
  const authorIds = new Set<string>();
  for (const member of memberships) {
    if (member.role === "owner" && member.author_id && owners.has(member.user_id)) authorIds.add(member.author_id);
  }
  return authorIds;
}

export type AgreementSubject = {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
};

export type AgreementDecision = {
  author_id: string | null;
  practice_id: string | null;
  direction_key: string;
  allowed: boolean | null;
};

function decisionValue(
  subject: AgreementSubject,
  kind: "artist" | "album",
  directionKey: string,
  decisions: readonly AgreementDecision[],
) {
  const artist = decisions.find((row) => row.author_id === subject.authorId && row.direction_key === directionKey);
  const album = kind === "album"
    ? decisions.find((row) => row.practice_id === subject.id && row.direction_key === directionKey)
    : undefined;
  if (typeof album?.allowed === "boolean") return album.allowed;
  if (typeof artist?.allowed === "boolean") return artist.allowed;
  return null;
}

export function filterAgreementSubjects(input: {
  kind: "artist" | "album";
  artists: readonly { id: string; name: string }[];
  albums: readonly { id: string; title: string; authorId: string }[];
  acceptedAuthorIds: ReadonlySet<string>;
  query: string;
  direction: string | null;
  decision: string | null;
  directions: readonly { key: string }[];
  decisions: readonly AgreementDecision[];
  hiddenAuthorIds?: ReadonlySet<string>;
  hiddenOnly?: boolean;
  offset: number;
  limit: number;
}): { rows: AgreementSubject[]; total: number } {
  const names = new Map(input.artists.map((artist) => [artist.id, artist.name]));
  const subjects: AgreementSubject[] = input.kind === "artist"
    ? input.artists.filter((artist) => input.acceptedAuthorIds.has(artist.id)).map((artist) => ({
      id: artist.id, title: artist.name, authorId: artist.id, authorName: artist.name,
    }))
    : input.albums.filter((album) => input.acceptedAuthorIds.has(album.authorId)).map((album) => ({
      id: album.id, title: album.title, authorId: album.authorId, authorName: names.get(album.authorId) ?? "",
    }));
  const needle = input.query.toLowerCase();
  const hidden = input.hiddenAuthorIds ?? new Set<string>();
  const directions = input.directions.filter((direction) => !input.direction || direction.key === input.direction);
  const matched = subjects.filter((subject) => {
    const authorHidden = hidden.has(subject.authorId);
    if (input.hiddenOnly ? !authorHidden : authorHidden) return false;
    if (!`${subject.title} ${subject.authorName}`.toLowerCase().includes(needle)) return false;
    if (!input.decision) return true;
    return directions.some((direction) => {
      const value = decisionValue(subject, input.kind, direction.key, input.decisions);
      if (input.decision === "allowed") return value === true;
      if (input.decision === "denied") return value === false;
      if (input.decision === "unreviewed") return value == null;
      return false;
    });
  });
  matched.sort((left, right) => left.title < right.title ? -1 : left.title > right.title ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const offset = Math.max(0, input.offset);
  const limit = Math.max(1, input.limit);
  return { rows: matched.slice(offset, offset + limit), total: matched.length };
}
