import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";
import { sanitizeJsonLdPlainText } from "@/lib/seo/json-ld/sanitize-text";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import { verticalGuideCanonical } from "./metadata";
import { articlePath } from "./registry";
import type { VerticalGuideArticle } from "./types";
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
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: "АудиоЛад Бизнес", path: "/b" },
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
      image: [`${origin.replace(/\/$/, "")}${article.hero.src}`],
      author: {
        "@type": "Organization",
        name: vertical?.byline ?? SITE_BRAND,
        url: `${origin.replace(/\/$/, "")}${vertical?.path ?? "/b"}`,
      },
      publisher: {
        "@type": "Organization",
        "@id": `${origin.replace(/\/$/, "")}/#organization`,
        name: SITE_BRAND,
        url: `${origin.replace(/\/$/, "")}/`,
        logo: {
          "@type": "ImageObject",
          url: `${origin.replace(/\/$/, "")}/audiolad-logo.png`,
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
