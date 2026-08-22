import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import { sanitizeJsonLdPlainText } from "@/lib/seo/json-ld/sanitize-text";
import { secondsToIso8601Duration } from "@/lib/seo/json-ld/duration";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import { getListenPreviewItems } from "./preview";
import type { ListenPageData } from "./types";

function originUrl(origin = getAppOrigin()): string {
  return origin.replace(/\/$/, "");
}

function absolutePath(path: string, origin = getAppOrigin()): string {
  return `${originUrl(origin)}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildListenPageFaqJsonLd(
  data: ListenPageData,
): JsonLdNode | null {
  if (data.definition.faq.length === 0) {
    return null;
  }

  return {
    "@type": "FAQPage",
    "@id": `${data.canonicalUrl}#faq`,
    mainEntity: data.definition.faq.map((item) => ({
      "@type": "Question",
      name: sanitizeJsonLdPlainText(item.question),
      acceptedAnswer: {
        "@type": "Answer",
        text: sanitizeJsonLdPlainText(item.answer),
      },
    })),
  };
}

export function buildListenPlaylistItemListJsonLd(
  data: ListenPageData,
  origin = getAppOrigin(),
): JsonLdNode | null {
  const preview = getListenPreviewItems(data.playlist.items).filter(
    (item) => item.productHref || item.title,
  );

  if (preview.length === 0) {
    return null;
  }

  return {
    "@type": "ItemList",
    "@id": `${data.canonicalUrl}#playlist`,
    name: data.playlist.playlist.title,
    numberOfItems: preview.length,
    itemListElement: preview.map((item, index) => {
      const duration = secondsToIso8601Duration(item.durationSeconds);
      const url = item.productHref
        ? absolutePath(item.productHref, origin)
        : undefined;

      return {
        "@type": "ListItem",
        position: item.position > 0 ? item.position : index + 1,
        name: item.title,
        url,
        item: {
          "@type": "CreativeWork",
          name: item.title,
          url,
          ...(item.authorName
            ? {
                author: {
                  "@type": "Person",
                  name: item.authorName,
                },
              }
            : {}),
          ...(duration ? { duration } : {}),
        },
      };
    }),
  };
}

export function buildListenPageJsonLd(
  data: ListenPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = originUrl(origin);

  return {
    "@type": "Article",
    "@id": `${data.canonicalUrl}#article`,
    headline: data.definition.h1,
    description: data.definition.description,
    inLanguage: "ru-RU",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": data.canonicalUrl,
    },
    url: data.canonicalUrl,
    author: {
      "@type": "Organization",
      name: SITE_BRAND,
      url: `${siteOrigin}/`,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${siteOrigin}/#organization`,
      name: SITE_BRAND,
      url: `${siteOrigin}/`,
      logo: {
        "@type": "ImageObject",
        url: `${siteOrigin}/audiolad-logo.png`,
      },
    },
  };
}

export function buildListenPageJsonLdGraph(
  data: ListenPageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = originUrl(origin);
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: data.definition.h1, path: data.path },
    ],
    origin,
  );

  const graph: JsonLdNode[] = [
    buildOrganizationJsonLd(origin),
    {
      "@type": "WebPage",
      "@id": `${data.canonicalUrl}#webpage`,
      url: data.canonicalUrl,
      name: data.definition.h1,
      description: data.definition.description,
      inLanguage: "ru-RU",
      isPartOf: {
        "@id": `${siteOrigin}/#website`,
      },
    },
    buildListenPageJsonLd(data, origin),
  ];

  if (breadcrumbs) {
    const breadcrumbNode = { ...breadcrumbs };
    delete breadcrumbNode["@context"];
    graph.push(breadcrumbNode);
  }

  const itemList = buildListenPlaylistItemListJsonLd(data, origin);

  if (itemList) {
    graph.push(itemList);
  }

  const faq = buildListenPageFaqJsonLd(data);

  if (faq) {
    graph.push(faq);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
