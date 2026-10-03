import "server-only";

import {
  parsePublicCatalogSection,
  type PublicCatalogSection,
} from "@/lib/catalog/catalog-sections";
import {
  listMaxPublishedCatalog,
  parseMaxCatalogAccessParam,
  parseMaxCatalogClassParam,
  parseMaxCatalogTopicParam,
  type ListMaxPublishedCatalogInput,
} from "@/lib/max/catalog";

export function parseVkCatalogBody(
  body: Record<string, unknown>,
): { ok: true; input: ListMaxPublishedCatalogInput } | { ok: false } {
  if (body.query != null && typeof body.query !== "string") {
    return { ok: false };
  }

  const section = parseVkCatalogSection(body.section);
  if (!section.ok) return { ok: false };

  const topic = parseMaxCatalogTopicParam(body.topic);
  if (!topic.ok) return { ok: false };

  const access = parseMaxCatalogAccessParam(body.access);
  if (!access.ok) return { ok: false };

  const publicationClass = parseMaxCatalogClassParam(body.class);
  if (!publicationClass.ok) return { ok: false };

  const input: ListMaxPublishedCatalogInput = {};
  if (typeof body.query === "string") input.query = body.query;
  if (section.section) input.section = section.section;
  if (topic.topicKey) input.topicKey = topic.topicKey;
  if (access.access !== "all") input.access = access.access;
  if (publicationClass.class !== "all") input.class = publicationClass.class;
  return { ok: true, input };
}

function parseVkCatalogSection(
  value: unknown,
): { ok: true; section: PublicCatalogSection | null } | { ok: false } {
  if (value == null) return { ok: true, section: null };
  if (typeof value !== "string") return { ok: false };
  const section = parsePublicCatalogSection(value);
  if (!section) return { ok: false };
  return { ok: true, section };
}

/** Ordinary guest catalog. Visibility stays inside the canonical loader. */
export async function loadVkGuestCatalog(input: ListMaxPublishedCatalogInput = {}) {
  return listMaxPublishedCatalog(input);
}
