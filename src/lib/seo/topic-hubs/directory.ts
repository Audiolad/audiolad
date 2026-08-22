import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";

import { buildTopicHubPath } from "./paths";
import { listTopicHubDefinitions } from "./registry";
import type { TopicHubDefinition } from "./types";

export const TOPICS_DIRECTORY_PATH = "/topics";

export const TOPICS_DIRECTORY_H1 = "Темы";

export const TOPICS_DIRECTORY_INTRO =
  "Тематические подборки аудиопрактик: любовь к себе, женская энергия, бесплатные медитации, деньги и изобилие.";

export const TOPICS_DIRECTORY_SEO_TITLE =
  "Темы аудиопрактик и медитаций – АудиоЛад";

export const TOPICS_DIRECTORY_META_DESCRIPTION =
  "Тематические подборки АудиоЛада: любовь к себе, женская энергия, бесплатные медитации, медитации на деньги и изобилие.";

export type TopicsDirectoryCard = {
  slug: string;
  title: string;
  href: string;
  description: string;
};

export type TopicsDirectoryPageData = {
  path: string;
  canonicalUrl: string;
  h1: string;
  intro: string;
  hubs: readonly TopicsDirectoryCard[];
};

export function isTopicsDirectoryHubListed(hub: TopicHubDefinition): boolean {
  const slug = hub.slug?.trim().toLowerCase() ?? "";

  return Boolean(slug && hub.title?.trim());
}

export function listTopicsDirectoryCards(
  hubs: readonly TopicHubDefinition[] = listTopicHubDefinitions(),
): TopicsDirectoryCard[] {
  return hubs.filter(isTopicsDirectoryHubListed).map((hub) => ({
    slug: hub.slug.trim().toLowerCase(),
    title: hub.title.trim(),
    href: buildTopicHubPath(hub.slug),
    description: hub.intro.replace(/\s+/g, " ").trim(),
  }));
}

export function loadTopicsDirectoryPageData(
  hubs: readonly TopicHubDefinition[] = listTopicHubDefinitions(),
): TopicsDirectoryPageData {
  return {
    path: TOPICS_DIRECTORY_PATH,
    canonicalUrl: buildSiteCanonicalUrl(TOPICS_DIRECTORY_PATH),
    h1: TOPICS_DIRECTORY_H1,
    intro: TOPICS_DIRECTORY_INTRO,
    hubs: listTopicsDirectoryCards(hubs),
  };
}
