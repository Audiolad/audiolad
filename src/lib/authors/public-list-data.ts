import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorShortBio } from "@/lib/authors/profile";
import { resolveAuthorPositioningText } from "@/lib/authors/brand-assets";
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
  shortPositioning: string;
  shortBio: string | null;
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
  short_bio: string | null;
  short_positioning: string | null;
  description: string | null;
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
      authors!practices_author_id_fkey (
        id,
        name,
        slug,
        short_bio,
        short_positioning,
        description,
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
    authors: AuthorJoinRow | AuthorJoinRow[];
  }>) {
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;

    if (!author?.id || !author.slug?.trim() || !author.name?.trim()) {
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
    shortPositioning: resolveAuthorPositioningText(author.short_positioning),
    shortBio: resolveAuthorShortBio(author),
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
