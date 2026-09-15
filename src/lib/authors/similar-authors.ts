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
import {
  POSTGREST_IN_FILTER_CHUNK_SIZE,
  chunkIds,
} from "@/lib/supabase/chunk";

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

type TopicKeyRow = {
  topics?:
    | { key?: string | null }
    | Array<{ key?: string | null }>
    | null;
};

function topicKeyFromRow(row: TopicKeyRow): string | null {
  const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
  const key = topic?.key;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function logTopicsChunkError(details: {
  table: "author_topics" | "practice_topics";
  stage: string;
  chunkIndex: number;
  chunkSize: number;
  totalIds: number;
  error: unknown;
}) {
  const errorDetails =
    details.error && typeof details.error === "object"
      ? (details.error as Record<string, unknown>)
      : {};

  console.error("[similar-authors] topics_chunk_failed", {
    table: details.table,
    stage: details.stage,
    chunkIndex: details.chunkIndex,
    chunkSize: details.chunkSize,
    totalIds: details.totalIds,
    code: typeof errorDetails.code === "string" ? errorDetails.code : null,
    message:
      typeof errorDetails.message === "string" ? errorDetails.message : null,
  });
}

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
    .eq("is_catalog_listed", true)
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
    const authorIdChunks = chunkIds(
      candidateIds,
      POSTGREST_IN_FILTER_CHUNK_SIZE,
    );

    for (
      let chunkIndex = 0;
      chunkIndex < authorIdChunks.length;
      chunkIndex += 1
    ) {
      const authorIdChunk = authorIdChunks[chunkIndex];
      const { data: authorTopicRows, error: authorTopicsError } = await supabase
        .from("author_topics")
        .select("author_id, topics!inner (key)")
        .in("author_id", authorIdChunk);

      if (authorTopicsError) {
        logTopicsChunkError({
          table: "author_topics",
          stage: "find_similar_authors_author_topics",
          chunkIndex,
          chunkSize: authorIdChunk.length,
          totalIds: candidateIds.length,
          error: authorTopicsError,
        });
        continue;
      }

      for (const row of authorTopicRows ?? []) {
        const key = topicKeyFromRow(row as TopicKeyRow);
        const candidate = authorScores.get(row.author_id as string);

        if (!candidate || !key) {
          continue;
        }

        if (authorTopicSet.has(key)) {
          candidate.overlapScore += 1;
        }
      }
    }
  }

  const practiceIds = (publishedPractices ?? []).map((row) => row.id as string);

  if (authorTopicSet.size > 0 && practiceIds.length > 0) {
    const practiceAuthorMap = new Map(
      (publishedPractices ?? []).map((row) => [
        row.id as string,
        row.author_id as string,
      ]),
    );
    const practiceIdChunks = chunkIds(
      practiceIds,
      POSTGREST_IN_FILTER_CHUNK_SIZE,
    );

    for (
      let chunkIndex = 0;
      chunkIndex < practiceIdChunks.length;
      chunkIndex += 1
    ) {
      const practiceIdChunk = practiceIdChunks[chunkIndex];
      const { data: practiceTopicRows, error: practiceTopicsError } =
        await supabase
          .from("practice_topics")
          .select("practice_id, topics!inner (key)")
          .in("practice_id", practiceIdChunk);

      if (practiceTopicsError) {
        logTopicsChunkError({
          table: "practice_topics",
          stage: "find_similar_authors_practice_topics",
          chunkIndex,
          chunkSize: practiceIdChunk.length,
          totalIds: practiceIds.length,
          error: practiceTopicsError,
        });
        continue;
      }

      for (const row of practiceTopicRows ?? []) {
        const key = topicKeyFromRow(row as TopicKeyRow);
        const candidateAuthorId = practiceAuthorMap.get(
          row.practice_id as string,
        );
        const candidate = candidateAuthorId
          ? authorScores.get(candidateAuthorId)
          : undefined;

        if (!candidate || !key) {
          continue;
        }

        if (authorTopicSet.has(key)) {
          candidate.overlapScore += 1;
        }
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
