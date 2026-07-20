import type { SupabaseClient } from "@supabase/supabase-js";

import { isFixtureMarkedAuthor, isFixtureMarkedPractice } from "@/lib/fixtures/test-fixture-marker";
import { resolveAuthorCardPositioningText } from "@/lib/authors/brand-assets";
import { resolveAuthorAvatarUrl } from "@/lib/images/resolve-display";
import { buildAuthorPublicPath } from "@/lib/products/paths";

import {
  sortPublicAuthors,
  type PublicAuthorSort,
} from "./public-list";

export type PublicAuthorCard = {
  id: string;
  name: string;
  slug: string;
  positioningText: string | null;
  avatarUrl: string | null;
  avatarImage?: unknown;
  publishedCount: number;
  createdAt: string | null;
  href: string;
};

type AuthorJoinRow = {
  id: string;
  name: string;
  slug: string;
  short_positioning: string | null;
  avatar_url: string | null;
  avatar_image?: unknown;
  updated_at: string | null;
  created_at: string | null;
};

export async function loadPublicAuthorsList(
  supabase: SupabaseClient,
  options?: { sort?: PublicAuthorSort },
): Promise<{ authors: PublicAuthorCard[]; error: boolean }> {
  const { data: practices, error } = await supabase
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
        avatar_image,
        updated_at,
        created_at
      )
    `,
    )
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .not("author_id", "is", null);

  if (error) {
    return { authors: [], error: true };
  }

  if (!practices?.length) {
    return { authors: [], error: false };
  }

  const authorMap = new Map<
    string,
    {
      author: AuthorJoinRow;
      publishedCount: number;
    }
  >();

  for (const row of practices as Array<{
    author_id: string;
    cover_image?: unknown;
    authors: AuthorJoinRow | AuthorJoinRow[];
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

    const existing = authorMap.get(author.id);

    if (existing) {
      existing.publishedCount += 1;
      continue;
    }

    authorMap.set(author.id, {
      author,
      publishedCount: 1,
    });
  }

  const authors = [...authorMap.values()].map(({ author, publishedCount }) => ({
    id: author.id,
    name: author.name.trim(),
    slug: author.slug.trim(),
    positioningText: resolveAuthorCardPositioningText(author.short_positioning),
    avatarUrl: resolveAuthorAvatarUrl(
      {
        avatar_url: author.avatar_url,
        avatar_image: author.avatar_image,
        updated_at: author.updated_at,
      },
      112,
      "md",
    ),
    avatarImage: author.avatar_image,
    publishedCount,
    createdAt: author.created_at,
    href: buildAuthorPublicPath(author.slug.trim()),
  }));

  return {
    authors: sortPublicAuthors(authors, options?.sort ?? "products"),
    error: false,
  };
}
