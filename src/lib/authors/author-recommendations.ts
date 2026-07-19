export const SIMILAR_AUTHORS_LIMIT = 4;

export type AuthorRecommendationCandidate = {
  id: string;
  name: string;
  overlapScore: number;
};

export function sortRelatedAuthorCandidates<
  T extends AuthorRecommendationCandidate,
>(candidates: T[]): T[] {
  return [...candidates].sort((left, right) => {
    if (right.overlapScore !== left.overlapScore) {
      return right.overlapScore - left.overlapScore;
    }

    return left.name.localeCompare(right.name, "ru");
  });
}

export function sortFallbackAuthorCandidates<
  T extends AuthorRecommendationCandidate,
>(candidates: T[]): T[] {
  return [...candidates].sort((left, right) =>
    left.name.localeCompare(right.name, "ru"),
  );
}

export function mergeAuthorRecommendations<
  T extends AuthorRecommendationCandidate,
>({
  relatedAuthors,
  fallbackAuthors,
  currentAuthorId,
  limit = SIMILAR_AUTHORS_LIMIT,
}: {
  relatedAuthors: T[];
  fallbackAuthors: T[];
  currentAuthorId: string;
  limit?: number;
}): T[] {
  const selected: T[] = [];
  const seenIds = new Set<string>();

  const tryAdd = (candidate: T) => {
    if (candidate.id === currentAuthorId || seenIds.has(candidate.id)) {
      return;
    }

    seenIds.add(candidate.id);
    selected.push(candidate);
  };

  for (const candidate of sortRelatedAuthorCandidates(
    relatedAuthors.filter((author) => author.overlapScore > 0),
  )) {
    if (selected.length >= limit) {
      break;
    }

    tryAdd(candidate);
  }

  for (const candidate of sortFallbackAuthorCandidates(
    fallbackAuthors.filter((author) => author.overlapScore === 0),
  )) {
    if (selected.length >= limit) {
      break;
    }

    tryAdd(candidate);
  }

  return selected;
}
