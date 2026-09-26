export const BUSINESS_LISTEN_LIMIT = 4;

export type BusinessListenExample = {
  id: string;
  title: string;
  authorName: string | null;
  authorSlug: string;
  slug: string;
  href: string;
  coverUrl: string | null;
  coverImage: unknown;
  updatedAt: string | null;
  format: string | null;
};

export type BusinessListenCandidate = {
  id: string;
  title: string;
  subtitle?: string | null;
  productKind?: string | null;
  isFree: boolean;
  audioCount?: number | null;
  authorSlug?: string | null;
  slug?: string | null;
};

const LISTEN_RULES: readonly { weight: number; pattern: RegExp }[] = [
  { weight: 5, pattern: /(?:^|[^a-zа-яё])(?:spa|спа)(?=$|[^a-zа-яё])/i },
  { weight: 5, pattern: /джаз|jazz/i },
  { weight: 5, pattern: /lounge|лаунж/i },
  { weight: 4, pattern: /пиано|piano|фортепиано/i },
  {
    weight: 4,
    pattern: /фонов(?:ая|ой|ую|ое|ые|ых)?\s+музык|background\s+music/i,
  },
  {
    weight: 3,
    pattern: /спокойн(?:ая|ой|ую|ое|ые|ый|ым)?\s+(?:музык|джаз|пиано|фон)/i,
  },
];

export function scoreBusinessListenCandidate(
  candidate: BusinessListenCandidate,
): number {
  if (candidate.productKind !== "music") {
    return 0;
  }

  if (!candidate.authorSlug?.trim() || !candidate.slug?.trim()) {
    return 0;
  }

  if (candidate.audioCount === 0) {
    return 0;
  }

  const haystack = `${candidate.title}\n${candidate.subtitle ?? ""}`;
  let score = 0;

  for (const rule of LISTEN_RULES) {
    if (rule.pattern.test(haystack)) {
      score += rule.weight;
    }
  }

  if (score > 0 && candidate.isFree) {
    score += 1;
  }

  return score;
}

export function selectBusinessListenCandidates<T extends BusinessListenCandidate>(
  candidates: readonly T[],
  limit = BUSINESS_LISTEN_LIMIT,
): T[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreBusinessListenCandidate(candidate),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.candidate.title.localeCompare(right.candidate.title, "ru");
    })
    .slice(0, limit)
    .map((item) => item.candidate);
}
