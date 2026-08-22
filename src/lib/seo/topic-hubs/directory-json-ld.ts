import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";

import type { TopicsDirectoryPageData } from "./directory";
import {
  TOPICS_DIRECTORY_H1,
  TOPICS_DIRECTORY_META_DESCRIPTION,
} from "./directory";

function originUrl(origin = getAppOrigin()): string {
  return origin.replace(/\/$/, "");
}

export function buildTopicsDirectoryCollectionJsonLd(
  data: TopicsDirectoryPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = originUrl(origin);
  const itemListElement = data.hubs.map((hub, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: `${siteOrigin}${hub.href}`,
    name: hub.title,
  }));

  return {
    "@type": "CollectionPage",
    "@id": `${data.canonicalUrl}#webpage`,
    url: data.canonicalUrl,
    name: TOPICS_DIRECTORY_H1,
    description: TOPICS_DIRECTORY_META_DESCRIPTION,
    inLanguage: "ru-RU",
    isPartOf: {
      "@id": `${siteOrigin}/#website`,
    },
    mainEntity: {
      "@type": "ItemList",
      "@id": `${data.canonicalUrl}#itemlist`,
      name: TOPICS_DIRECTORY_H1,
      numberOfItems: data.hubs.length,
      itemListElement,
    },
  };
}

export function buildTopicsDirectoryJsonLdGraph(
  data: TopicsDirectoryPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: TOPICS_DIRECTORY_H1, path: data.path },
    ],
    origin,
  );
  const collection = buildTopicsDirectoryCollectionJsonLd(data, origin);
  const graph: JsonLdNode[] = [
    buildOrganizationJsonLd(origin),
    collection,
  ];

  if (breadcrumbs) {
    graph.push(breadcrumbs);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
