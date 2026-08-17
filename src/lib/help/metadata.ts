import type { Metadata } from "next";

import { helpArticlePath, helpHubHref } from "@/lib/help/paths";
import type { HelpArticle } from "@/lib/help/types";
import { getAppOrigin } from "@/lib/seo/app-origin";

function absoluteUrl(path: string): string {
  return `${getAppOrigin().replace(/\/$/, "")}${path}`;
}

export function buildHelpHubMetadata(): Metadata {
  const title = "Справочный центр – АудиоЛад";
  const description =
    "Пошаговые инструкции по работе с АудиоЛадом для слушателей и авторов. Поиск ответов и форма обращения в поддержку.";
  const url = absoluteUrl(helpHubHref());

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
    },
  };
}

export function helpArticleHeading(article: HelpArticle): string {
  return article.heading ?? article.title;
}

export function helpArticleDocumentTitle(article: HelpArticle): string {
  if (article.seoTitle?.trim()) {
    return article.seoTitle.trim();
  }
  return `${article.title} – Справочный центр АудиоЛад`;
}

export function helpArticleMetaDescription(article: HelpArticle): string {
  return article.seoDescription?.trim() || article.description;
}

export function buildHelpArticleMetadata(article: HelpArticle): Metadata {
  const title = helpArticleDocumentTitle(article);
  const description = helpArticleMetaDescription(article);
  const url = absoluteUrl(helpArticlePath(article));

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
    },
  };
}

export function buildHelpSupportMetadata(): Metadata {
  return {
    title: "Задать вопрос поддержке – АудиоЛад",
    description:
      "Форма обращения в поддержку АудиоЛада. Ответ придёт на указанную электронную почту.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export function buildHelpAudienceHubMetadata(kind: "listeners" | "authors"): Metadata {
  if (kind === "listeners") {
    return {
      title: "Справка для слушателей – АудиоЛад",
      description:
        "Инструкции по регистрации, входу, Аудиотеке и установке АудиоЛада на телефон.",
      alternates: { canonical: absoluteUrl("/help/listeners") },
    };
  }

  return {
    title: "Справка для авторов – АудиоЛад",
    description:
      "Инструкции по созданию продуктов, публикации, личной работе, продвижению и выплатам.",
    alternates: { canonical: absoluteUrl("/help/authors") },
  };
}
