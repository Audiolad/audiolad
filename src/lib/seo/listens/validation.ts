import { isValidPlaylistPublicSlug } from "@/lib/playlists/public-slug";
import { getTopicHubBySlug } from "@/lib/seo/topic-hubs/registry";

import { LISTEN_PAGE_TYPE, type ListenPageDefinition } from "./types";
import { isValidListenPageSlug } from "./paths";

const FORBIDDEN_COMPOSITION_KEYS = [
  "items",
  "itemIds",
  "practiceIds",
  "practiceSlugs",
  "practices",
  "tracks",
] as const;

export type ListenDefinitionValidation =
  | { ok: true; definition: ListenPageDefinition }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseListenPageDefinition(
  value: unknown,
): ListenDefinitionValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "invalid_object" };
  }

  const record = value as Record<string, unknown>;

  if (record.type !== LISTEN_PAGE_TYPE) {
    return { ok: false, reason: "type_must_be_listen" };
  }

  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    if (key in record) {
      return { ok: false, reason: "hardcoded_items_forbidden" };
    }
  }

  if (!isNonEmptyString(record.slug) || !isValidListenPageSlug(record.slug)) {
    return { ok: false, reason: "invalid_slug" };
  }

  if (
    !isNonEmptyString(record.playlistSlug) ||
    !isValidPlaylistPublicSlug(record.playlistSlug)
  ) {
    return { ok: false, reason: "playlist_slug_required" };
  }

  if (!isNonEmptyString(record.title)) {
    return { ok: false, reason: "title_required" };
  }

  if (!isNonEmptyString(record.description)) {
    return { ok: false, reason: "description_required" };
  }

  if (!isNonEmptyString(record.h1)) {
    return { ok: false, reason: "h1_required" };
  }

  if (!Array.isArray(record.intro) || record.intro.length === 0) {
    return { ok: false, reason: "intro_required" };
  }

  if (!Array.isArray(record.sections)) {
    return { ok: false, reason: "sections_required" };
  }

  if (!Array.isArray(record.faq)) {
    return { ok: false, reason: "faq_required" };
  }

  if (record.topicSlug !== undefined) {
    if (!isNonEmptyString(record.topicSlug) || !isValidListenPageSlug(record.topicSlug)) {
      return { ok: false, reason: "invalid_topic_slug" };
    }

    if (!getTopicHubBySlug(record.topicSlug.trim().toLowerCase())) {
      return { ok: false, reason: "unknown_topic_slug" };
    }
  }

  return { ok: true, definition: value as ListenPageDefinition };
}

export function assertListenPageDefinition(
  value: unknown,
): ListenPageDefinition {
  const parsed = parseListenPageDefinition(value);

  if (!parsed.ok) {
    throw new Error(`Invalid listen page definition: ${parsed.reason}`);
  }

  return parsed.definition;
}
