import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const authorPageArticle: HelpArticle = {
  id: "help.authors.author-page",
  slug: "author-page",
  title: "Как оформить страницу автора",
  description:
    "Заполните публичную страницу автора: фото, короткое позиционирование и описание «Об авторе».",
  category: "authors",
  audience: "author",
  order: 30,
  keywords: [
    "страница автора",
    "профиль автора",
    "позиционирование",
    "об авторе",
    "аватар",
    "баннер",
  ],
  updatedAt: "2026-08-27",
  version: 3,
  relatedRoutes: ["/author-dashboard/profile"],
  relatedArticleIds: [
    "help.authors.create-first-product",
    "help.authors.publish-product",
    "help.authors.language-and-formatting",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Публичная страница автора помогает слушателям понять, кто вы и какие практики предлагает. Оформление выполняется в кабинете автора.",
      ],
    },
    {
      id: "steps",
      title: "Как заполнить страницу",
      steps: [
        helpRich(
          "Откройте кабинет автора → «Страница автора» (",
          helpPublicLink("/author-dashboard/profile"),
          ").",
        ),
        "Загрузите аватар и при необходимости баннер.",
        "Заполните поле «Короткое позиционирование» — краткую фразу о вашей специализации.",
        "Заполните раздел «Об авторе» — более подробное описание.",
        "При желании добавьте контакты: Telegram, MAX или другую ссылку.",
        "Сохраните изменения.",
      ],
      notes: [
        "Короткое позиционирование видно в карточках и на публичной странице — формулируйте его ясно и по делу.",
        helpRich(
          "Публичное название проекта и тексты на странице оформляйте преимущественно на русском языке кириллицей — см. статью ",
          helpPublicLink("/help/authors/language-and-formatting", {
            label: "«Язык и оформление материалов»",
          }),
          ".",
        ),
        "Публичная страница становится полезнее, когда у вас уже есть хотя бы один опубликованный продукт.",
      ],
    },
  ],
  cta: {
    label: "Открыть страницу автора",
    href: "/author-dashboard/profile",
  },
};
