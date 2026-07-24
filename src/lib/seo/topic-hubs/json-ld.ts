import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import { resolveJsonLdImageUrl } from "@/lib/seo/json-ld/url-policy";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import type { TopicHubPageData } from "./types";

function originUrl(origin = getAppOrigin()): string {
  return origin.replace(/\/$/, "");
}

export function buildTopicHubFaqJsonLd(
  data: TopicHubPageData,
): JsonLdNode | null {
  if (data.hub.faq.length === 0) {
    return null;
  }

  return {
    "@type": "FAQPage",
    "@id": `${data.canonicalUrl}#faq`,
    mainEntity: data.hub.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildTopicHubCollectionJsonLd(
  data: TopicHubPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = originUrl(origin);
  const itemListElement = data.products.slice(0, 30).map((product, index) => {
    const image = resolveJsonLdImageUrl(product.coverUrl, origin);

    return {
      "@type": "ListItem",
      position: index + 1,
      url: `${siteOrigin}${product.href}`,
      name: product.title,
      ...(image ? { image } : {}),
    };
  });

  return {
    "@type": "CollectionPage",
    "@id": `${data.canonicalUrl}#webpage`,
    url: data.canonicalUrl,
    name: data.hub.title,
    description: data.hub.metaDescription,
    inLanguage: "ru-RU",
    isPartOf: {
      "@id": `${siteOrigin}/#website`,
    },
    about: {
      "@type": "Thing",
      name: data.hub.title,
    },
    mainEntity: {
      "@type": "ItemList",
      "@id": `${data.canonicalUrl}#itemlist`,
      name: `Аудиопрактики: ${data.hub.title}`,
      numberOfItems: data.products.length,
      itemListElement,
    },
  };
}

export function buildTopicHubJsonLdGraph(
  data: TopicHubPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: "Каталог", path: "/catalog" },
      { name: data.hub.title, path: data.path },
    ],
    origin,
  );
  const faq = buildTopicHubFaqJsonLd(data);
  const collection = buildTopicHubCollectionJsonLd(data, origin);

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

  if (faq) {
    graph.push(faq);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
