import type { PublicPlaylistView } from "@/lib/playlists/public-detail";

export const LISTEN_PAGE_TYPE = "listen" as const;

export type ListenFaqItem = {
  question: string;
  answer: string;
};

export type ListenInlineSegment =
  | { text: string }
  | { strong: string }
  | { href: string; label: string };

export type ListenSectionBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "rich_paragraph"; segments: readonly ListenInlineSegment[] }
  | { kind: "heading"; level: 3; title: string }
  | { kind: "list"; items: readonly string[] };

export type ListenSection = {
  id: string;
  title: string;
  paragraphs: string[];
  blocks?: readonly ListenSectionBlock[];
};

export type ListenInternalLink = {
  href: string;
  title: string;
  description?: string;
};

export type ListenPageCta = {
  href: string;
  label: string;
  text?: string;
};

/**
 * Editorial SEO listen page. Composition always comes from the DB playlist
 * named by `playlistSlug` — never from hardcoded item IDs or practice slugs.
 */
export type ListenPageDefinition = {
  type: typeof LISTEN_PAGE_TYPE;
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: readonly string[];
  playlistSlug: string;
  /**
   * Editorial SEO/GEO slug of an existing `/topics/{topicSlug}` hub.
   * This is not a catalog `topics.key`. Absent means the listen is not
   * attached to a registered hub yet.
   */
  topicSlug?: string;
  sections: readonly ListenSection[];
  faq: readonly ListenFaqItem[];
  internalLinks?: readonly ListenInternalLink[];
  cta?: ListenPageCta;
  /** Indexable unless explicitly false. */
  indexable?: boolean;
};

export type ListenPageData = {
  definition: ListenPageDefinition;
  path: string;
  canonicalUrl: string;
  playlist: PublicPlaylistView;
};

export function isListenPageDefinition(
  value: unknown,
): value is ListenPageDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === LISTEN_PAGE_TYPE
  );
}
