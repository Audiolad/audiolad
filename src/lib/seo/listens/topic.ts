import { buildTopicHubPath } from "@/lib/seo/topic-hubs/paths";
import { getTopicHubBySlug } from "@/lib/seo/topic-hubs/registry";

import { buildListenPagePath } from "./paths";
import { listIndexableListenPageDefinitions } from "./registry";
import type { ListenPageDefinition } from "./types";

export type ListenEditorialTopicLink = {
  href: string;
  title: string;
};

export type ListenTopicCard = {
  slug: string;
  title: string;
  href: string;
  description: string;
};

function normalizeTopicSlug(topicSlug: string): string {
  return topicSlug.trim().toLowerCase();
}

export function listIndexableListenPagesByTopicSlug(
  topicSlug: string,
): readonly ListenPageDefinition[] {
  const normalized = normalizeTopicSlug(topicSlug);

  if (!normalized) {
    return [];
  }

  return listIndexableListenPageDefinitions().filter(
    (page) => page.topicSlug?.trim().toLowerCase() === normalized,
  );
}

export function listTopicHubListenCards(
  topicSlug: string,
): ListenTopicCard[] {
  return listIndexableListenPagesByTopicSlug(topicSlug).map((page) => ({
    slug: page.slug,
    title: page.title,
    href: buildListenPagePath(page.slug),
    description: page.description,
  }));
}

export function resolveListenEditorialTopic(
  definition: ListenPageDefinition,
): ListenEditorialTopicLink | null {
  if (definition.indexable === false) {
    return null;
  }

  const topicSlug = definition.topicSlug?.trim().toLowerCase();

  if (!topicSlug) {
    return null;
  }

  const hub = getTopicHubBySlug(topicSlug);

  if (!hub) {
    return null;
  }

  return {
    href: buildTopicHubPath(hub.slug),
    title: hub.title,
  };
}
