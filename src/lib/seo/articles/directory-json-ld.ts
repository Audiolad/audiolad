import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import type { ArticleDirectoryPageData } from "./directory";
import {
  ARTICLES_DIRECTORY_META_DESCRIPTION,
  ARTICLES_DIRECTORY_H1,
} from "./directory";

function originUrl(origin = getAppOrigin()): string {
  return origin.replace(/\/$/, "");
}

export function buildArticlesDirectoryCollectionJsonLd(
  data: ArticleDirectoryPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = originUrl(origin);
  const itemListElement = data.articles.map((article, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: `${siteOrigin}${article.href}`,
    name: article.title,
  }));

  return {
    "@type": "CollectionPage",
    "@id": `${data.canonicalUrl}#webpage`,
    url: data.canonicalUrl,
    name: ARTICLES_DIRECTORY_H1,
    description: ARTICLES_DIRECTORY_META_DESCRIPTION,
    inLanguage: "ru-RU",
    isPartOf: {
      "@id": `${siteOrigin}/#website`,
    },
    mainEntity: {
      "@type": "ItemList",
      "@id": `${data.canonicalUrl}#itemlist`,
      name: ARTICLES_DIRECTORY_H1,
      numberOfItems: data.articles.length,
      itemListElement,
    },
  };
}

export function buildArticlesDirectoryJsonLdGraph(
  data: ArticleDirectoryPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: ARTICLES_DIRECTORY_H1, path: data.path },
    ],
    origin,
  );
  const collection = buildArticlesDirectoryCollectionJsonLd(data, origin);
  const graph: JsonLdNode[] = [
    {
      "@type": "Organization",
      "@id": `${originUrl(origin)}/#organization`,
      name: SITE_BRAND,
      url: `${originUrl(origin)}/`,
    },
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
