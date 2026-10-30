import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import { sanitizeJsonLdPlainText } from "@/lib/seo/json-ld/sanitize-text";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import { verticalGuideCanonical } from "./metadata";
import { articlePath, listVerticalArticles } from "./registry";
import type { B2BVertical, VerticalGuideArticle } from "./types";
import { getVertical } from "./verticals";

function withoutContext(node: JsonLdNode): JsonLdNode {
  const copy = { ...node };
  delete copy["@context"];
  return copy;
}

export function buildVerticalArticleJsonLd(article: VerticalGuideArticle): JsonLdNode {
  const vertical = getVertical(article.verticalId);
  const path = articlePath(article);
  const origin = getAppOrigin();
  const url = verticalGuideCanonical(path);
  const base = origin.replace(/\/$/, "");
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: vertical?.title ?? article.title, path: vertical?.path ?? "/b" },
      { name: article.title, path },
    ],
    origin,
  );

  const graph: JsonLdNode[] = [
    buildOrganizationJsonLd(origin),
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: article.title,
      description: article.description,
      inLanguage: "ru-RU",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      // Dates live only here, in the sitemap and in article:*_time meta (never on the page).
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      image: [
        {
          "@type": "ImageObject",
          url: `${base}${article.ogImage.src}`,
          width: article.ogImage.width,
          height: article.ogImage.height,
        },
        `${base}${article.hero.src}`,
      ],
      author: {
        "@type": "Organization",
        name: vertical?.byline ?? SITE_BRAND,
        url: `${base}${vertical?.path ?? "/b"}#o-razdele`,
        description: vertical?.about?.[0] ?? vertical?.intro,
        parentOrganization: { "@id": `${base}/#organization` },
      },
      publisher: {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: SITE_BRAND,
        url: `${base}/`,
        logo: {
          "@type": "ImageObject",
          url: `${base}/audiolad-logo.png`,
        },
      },
    },
  ];

  if (breadcrumbs) {
    graph.push(withoutContext(breadcrumbs));
  }

  if (article.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: article.faq.map((item) => ({
        "@type": "Question",
        name: sanitizeJsonLdPlainText(item.question),
        acceptedAnswer: {
          "@type": "Answer",
          text: sanitizeJsonLdPlainText(item.answer),
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

/** Section index: CollectionPage with an ItemList of the published articles. */
export function buildVerticalIndexJsonLd(vertical: B2BVertical): JsonLdNode {
  const origin = getAppOrigin();
  const base = origin.replace(/\/$/, "");
  const url = verticalGuideCanonical(vertical.path);
  const articles = listVerticalArticles(vertical.id);
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: vertical.title, path: vertical.path },
    ],
    origin,
  );
  const modified = articles.map((article) => article.updatedAt).sort().at(-1);

  const graph: JsonLdNode[] = [
    buildOrganizationJsonLd(origin),
    {
      "@type": "CollectionPage",
      "@id": `${url}#page`,
      name: vertical.title,
      description: vertical.intro,
      url,
      inLanguage: "ru-RU",
      ...(modified ? { dateModified: modified } : {}),
      isPartOf: { "@id": `${base}/#organization` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: articles.map((article, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: verticalGuideCanonical(articlePath(article)),
          name: article.title,
        })),
      },
    },
  ];
  if (breadcrumbs) {
    graph.push(withoutContext(breadcrumbs));
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
