import type { HelpArticle } from "@/lib/help/types";
import {
  PRODUCT_LANGUAGE_APPLIES_TO,
  PRODUCT_LANGUAGE_DISPUTE_NOTE,
  PRODUCT_LANGUAGE_EXCEPTIONS,
  PRODUCT_LANGUAGE_RULE_PARAGRAPHS,
} from "@/lib/author-products/language-guidelines";

export const languageAndFormattingArticle: HelpArticle = {
  id: "help.authors.language-and-formatting",
  slug: "language-and-formatting",
  title: "Язык и оформление материалов",
  description:
    "Как оформлять названия, описания и обложки на русскоязычной платформе АудиоЛад.",
  category: "authors",
  audience: "author",
  order: 15,
  keywords: [
    "язык",
    "кириллица",
    "русский язык",
    "название продукта",
    "оформление",
    "обложка",
    "описание",
    "правила для авторов",
  ],
  updatedAt: "2026-07-30",
  version: 1,
  relatedRoutes: [
    "/author-dashboard/products/new",
    "/author-dashboard",
  ],
  relatedArticleIds: [
    "help.authors.create-first-product",
    "help.authors.publish-product",
    "help.authors.author-page",
  ],
  sections: [
    {
      id: "rule",
      title: "Язык и оформление материалов",
      paragraphs: [...PRODUCT_LANGUAGE_RULE_PARAGRAPHS],
    },
    {
      id: "applies-to",
      title: "Что оформляется на русском языке",
      notes: [...PRODUCT_LANGUAGE_APPLIES_TO],
    },
    {
      id: "exceptions",
      title: "Когда допустимы иностранные слова",
      notes: [...PRODUCT_LANGUAGE_EXCEPTIONS, PRODUCT_LANGUAGE_DISPUTE_NOTE],
    },
    {
      id: "practice",
      title: "Как применять правило на практике",
      paragraphs: [
        "При создании и редактировании продукта в кабинете автора это правило показано в блоке «Язык оформления продукта» и в коротких подсказках у полей названия, подзаголовка, описания и обложки.",
        "Существующие опубликованные материалы не нужно срочно переименовывать. При существенном редактировании или повторной проверке постепенно приводите тексты и обложки к этому стандарту.",
      ],
    },
  ],
  cta: {
    label: "Создать аудиопродукт",
    href: "/author-dashboard/products/new",
  },
};
