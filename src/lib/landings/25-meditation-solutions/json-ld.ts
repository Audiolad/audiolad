import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  type JsonLdNode,
} from "@/lib/seo/json-ld";

import {
  MEDITATION_SOLUTIONS_H1,
  MEDITATION_SOLUTIONS_PUBLIC_PATH,
  MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
} from "./content";

export function buildMeditationSolutionsJsonLd(
  origin = getAppOrigin(),
): JsonLdNode {
  const siteOrigin = origin.replace(/\/$/, "");
  const pageUrl = `${siteOrigin}${MEDITATION_SOLUTIONS_PUBLIC_PATH}`;
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: MEDITATION_SOLUTIONS_H1, path: MEDITATION_SOLUTIONS_PUBLIC_PATH },
    ],
    origin,
  );

  const webPage: JsonLdNode = {
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: MEDITATION_SOLUTIONS_H1,
    description: MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
    inLanguage: "ru-RU",
    isPartOf: {
      "@id": `${siteOrigin}/#website`,
    },
    about: {
      "@id": `${siteOrigin}/#organization`,
    },
  };

  const graph: JsonLdNode[] = [
    buildOrganizationJsonLd(origin),
    buildWebSiteJsonLd(origin),
    webPage,
  ];

  if (breadcrumbs) {
    const breadcrumbNode = { ...breadcrumbs };
    delete breadcrumbNode["@context"];
    graph.push(breadcrumbNode);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
