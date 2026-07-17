import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAuthorPublicPath } from "@/lib/products/paths";

import { resolveAuthorShortBio } from "./profile";

export type SimilarAuthorCard = {
  id: string;
  name: string;
  slug: string;
  shortBio: string | null;
  avatarUrl: string | null;
  href: string;
  overlapScore: number;
};

export async function findSimilarAuthors(
  supabase: SupabaseClient,
  authorId: string,
  authorSlug: string,
  authorTopicKeys: string[],
): Promise<SimilarAuthorCard[]> {
  const { data: publishedPractices, error } = await supabase
    .from("practices")
    .select(
      `
      id,
      author_id,
      authors!inner (
        id,
        name,
        slug,
        short_bio,
        description,
        avatar_url
      )
    `,
    )
    .eq("status", "published")
    .neq("author_id", authorId);

  if (error || !publishedPractices?.length) {
    return [];
  }

  const authorScores = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
      short_bio: string | null;
      description: string | null;
      avatar_url: string | null;
      productCount: number;
      topicOverlap: number;
    }
  >();

  for (const row of publishedPractices as Array<{
    id: string;
    author_id: string;
    authors:
      | {
          id: string;
          name: string;
          slug: string;
          short_bio: string | null;
          description: string | null;
          avatar_url: string | null;
        }
      | Array<{
          id: string;
          name: string;
          slug: string;
          short_bio: string | null;
          description: string | null;
          avatar_url: string | null;
        }>;
  }>) {
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;

    if (!author?.id || !author.slug?.trim() || !author.name?.trim()) {
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
      short_bio: author.short_bio,
      description: author.description,
      avatar_url: author.avatar_url,
      productCount: 1,
      topicOverlap: 0,
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
        candidate.topicOverlap += 1;
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
        candidate.topicOverlap += 1;
      }
    }
  }

  return [...authorScores.values()]
    .filter((candidate) => candidate.productCount > 0)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      slug: candidate.slug,
      shortBio: resolveAuthorShortBio(candidate),
      avatarUrl: candidate.avatar_url?.trim() || null,
      href: buildAuthorPublicPath(candidate.slug),
      overlapScore: candidate.topicOverlap,
    }))
    .sort((left, right) => {
      if (right.overlapScore !== left.overlapScore) {
        return right.overlapScore - left.overlapScore;
      }

      return left.name.localeCompare(right.name, "ru");
    })
    .filter((candidate) => candidate.overlapScore > 0)
    .slice(0, 4);
}
