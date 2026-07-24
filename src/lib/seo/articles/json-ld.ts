import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import { resolveJsonLdImageUrl } from "@/lib/seo/json-ld/url-policy";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import type { ArticlePageData } from "./types";

function originUrl(origin = getAppOrigin()): string {
  return origin.replace(/\/$/, "");
}

export function buildArticleFaqJsonLd(
  data: ArticlePageData,
): JsonLdNode | null {
  if (data.article.faq.length === 0) {
    return null;
  }

  return {
    "@type": "FAQPage",
    "@id": `${data.canonicalUrl}#faq`,
    mainEntity: data.article.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildArticleJsonLd(
  data: ArticlePageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = originUrl(origin);
  const image = resolveJsonLdImageUrl(data.primaryPractice.coverUrl, origin);

  return {
    "@type": "Article",
    "@id": `${data.canonicalUrl}#article`,
    headline: data.article.title,
    description: data.article.metaDescription,
    inLanguage: "ru-RU",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": data.canonicalUrl,
    },
    url: data.canonicalUrl,
    datePublished: data.article.publishedAt,
    dateModified: data.article.updatedAt,
    author: {
      "@type": "Organization",
      name: data.article.authorLabel,
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
    ...(image ? { image: [image] } : {}),
    about: {
      "@type": "Thing",
      name: data.article.topicTitle,
      url: `${siteOrigin}${data.article.topicHref}`,
    },
  };
}

export function buildArticleJsonLdGraph(
  data: ArticlePageData,
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = originUrl(origin);
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: data.article.topicTitle, path: data.article.topicHref },
      { name: data.article.title, path: data.path },
    ],
    origin,
  );

  const graph: JsonLdNode[] = [
    {
      "@type": "Organization",
      "@id": `${siteOrigin}/#organization`,
      name: SITE_BRAND,
      url: `${siteOrigin}/`,
    },
    buildArticleJsonLd(data, origin),
  ];

  if (breadcrumbs) {
    const breadcrumbNode = { ...breadcrumbs };
    delete breadcrumbNode["@context"];
    graph.push(breadcrumbNode);
  }

  const faq = buildArticleFaqJsonLd(data);

  if (faq) {
    graph.push(faq);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
