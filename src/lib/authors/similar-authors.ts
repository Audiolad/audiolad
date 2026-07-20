import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mergeAuthorRecommendations,
  SIMILAR_AUTHORS_LIMIT,
} from "@/lib/authors/author-recommendations";
import {
  isFixtureMarkedAuthor,
  isFixtureMarkedPractice,
} from "@/lib/fixtures/test-fixture-marker";
import { resolveAuthorCardPositioningText } from "@/lib/authors/brand-assets";
import { buildAuthorPublicPath } from "@/lib/products/paths";

export type SimilarAuthorCard = {
  id: string;
  name: string;
  slug: string;
  positioningText: string | null;
  avatarUrl: string | null;
  href: string;
  overlapScore: number;
};

type AuthorCandidateRow = {
  id: string;
  name: string;
  slug: string;
  short_positioning: string | null;
  avatar_url: string | null;
  productCount: number;
  overlapScore: number;
};

export async function findSimilarAuthors(
  supabase: SupabaseClient,
  authorId: string,
  _authorSlug: string,
  authorTopicKeys: string[],
): Promise<SimilarAuthorCard[]> {
  const { data: publishedPractices, error } = await supabase
    .from("practices")
    .select(
      `
      id,
      author_id,
      cover_image,
      authors!practices_author_id_fkey (
        id,
        name,
        slug,
        short_positioning,
        avatar_url,
        avatar_image
      )
    `,
    )
    .eq("status", "published")
    .neq("author_id", authorId);

  if (error || !publishedPractices?.length) {
    return [];
  }

  const authorScores = new Map<string, AuthorCandidateRow>();

  for (const row of publishedPractices as Array<{
    id: string;
    author_id: string;
    cover_image?: unknown;
    authors:
      | {
          id: string;
          name: string;
          slug: string;
          short_positioning: string | null;
          avatar_url: string | null;
          avatar_image?: unknown;
        }
      | Array<{
          id: string;
          name: string;
          slug: string;
          short_positioning: string | null;
          avatar_url: string | null;
          avatar_image?: unknown;
        }>;
  }>) {
    if (isFixtureMarkedPractice(row)) {
      continue;
    }

    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;

    if (!author?.id || !author.slug?.trim() || !author.name?.trim()) {
      continue;
    }

    if (isFixtureMarkedAuthor(author)) {
      continue;
    }

    const existing = authorScores.get(author.id);

    if (existing) {
      existing.productCount += 1;
      continue;
    }

    authorScores.set(author.id, {
      id: author.id,
      name: author.name,
      slug: author.slug,
      short_positioning: author.short_positioning,
      avatar_url: author.avatar_url,
      productCount: 1,
      overlapScore: 0,
    });
  }

  const candidateIds = [...authorScores.keys()];

  if (candidateIds.length === 0) {
    return [];
  }

  const authorTopicSet = new Set(authorTopicKeys);

  if (authorTopicSet.size > 0) {
    const { data: authorTopicRows } = await supabase
      .from("author_topics")
      .select("author_id, topics!inner (key)")
      .in("author_id", candidateIds);

    for (const row of authorTopicRows ?? []) {
      const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
      const candidate = authorScores.get(row.author_id as string);

      if (!candidate || !topic?.key) {
        continue;
      }

      if (authorTopicSet.has(topic.key as string)) {
        candidate.overlapScore += 1;
      }
    }
  }

  const practiceIds = (publishedPractices ?? []).map((row) => row.id as string);

  if (authorTopicSet.size > 0 && practiceIds.length > 0) {
    const { data: practiceTopicRows } = await supabase
      .from("practice_topics")
      .select("practice_id, topics!inner (key)")
      .in("practice_id", practiceIds);

    const practiceAuthorMap = new Map(
      (publishedPractices ?? []).map((row) => [
        row.id as string,
        row.author_id as string,
      ]),
    );

    for (const row of practiceTopicRows ?? []) {
      const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
      const candidateAuthorId = practiceAuthorMap.get(row.practice_id as string);
      const candidate = candidateAuthorId
        ? authorScores.get(candidateAuthorId)
        : undefined;

      if (!candidate || !topic?.key) {
        continue;
      }

      if (authorTopicSet.has(topic.key as string)) {
        candidate.overlapScore += 1;
      }
    }
  }

  const candidates = [...authorScores.values()].filter(
    (candidate) => candidate.productCount > 0,
  );

  const relatedAuthors = candidates.filter((candidate) => candidate.overlapScore > 0);
  const fallbackAuthors = candidates.filter((candidate) => candidate.overlapScore === 0);

  const merged = mergeAuthorRecommendations({
    relatedAuthors,
    fallbackAuthors,
    currentAuthorId: authorId,
    limit: SIMILAR_AUTHORS_LIMIT,
  });

  return merged.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    positioningText: resolveAuthorCardPositioningText(candidate.short_positioning),
    avatarUrl: candidate.avatar_url?.trim() || null,
    href: buildAuthorPublicPath(candidate.slug),
    overlapScore: candidate.overlapScore,
  }));
}
