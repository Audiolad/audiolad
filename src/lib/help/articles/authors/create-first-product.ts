import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const createFirstProductArticle: HelpArticle = {
  id: "help.authors.create-first-product",
  slug: "create-first-product",
  title: "Как создать первый аудиопродукт",
  description:
    "Пошагово создайте черновик практики или курса в кабинете автора и подготовьте его к публикации.",
  category: "authors",
  audience: "author",
  order: 10,
  keywords: [
    "создать аудиопродукт",
    "новый продукт",
    "черновик",
    "практика",
    "курс",
    "кабинет автора",
    "аудио",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: ["/author-dashboard", "/author-dashboard/products/new"],
  relatedArticleIds: [
    "help.authors.language-and-formatting",
    "help.authors.publish-product",
    "help.authors.author-page",
    "help.finance.commercial-status",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Первый аудиопродукт создаётся в кабинете автора. На старте достаточно черновика: вы заполняете основные поля и загружаете аудио, а публикацию можно выполнить позже.",
      ],
    },
    {
      id: "steps",
      title: "Как создать черновик",
      steps: [
        "Откройте кабинет автора и перейдите в раздел «Продукты».",
        helpRich(
          "Нажмите «Создать аудиопродукт» — откроется форма нового продукта по адресу ",
          helpPublicLink("/author-dashboard/products/new"),
          ".",
        ),
        "Заполните название, формат, описание и другие обязательные поля.",
        "Загрузите аудиофайл или добавьте материалы курса, если выбран соответствующий формат.",
        "Нажмите «Сохранить черновик», чтобы сохранить прогресс без публикации.",
      ],
    },
    {
      id: "language",
      title: "Язык и оформление материалов",
      paragraphs: [
        "АудиоЛад — русскоязычная платформа. Название продукта, подзаголовок, описание, названия аудиозаписей и основные надписи на обложке оформляйте преимущественно на русском языке кириллицей.",
        helpRich(
          "Подробные правила, исключения и примеры — в статье ",
          helpPublicLink("/help/authors/language-and-formatting", {
            label: "«Язык и оформление материалов»",
          }),
          ".",
        ),
      ],
    },
    {
      id: "notes",
      title: "На что обратить внимание",
      notes: [
        "Черновик можно редактировать сколько угодно раз до публикации.",
        "Платные продукты станут доступны после подключения коммерческого статуса — см. статью о коммерческом статусе.",
        "Перед публикацией рекомендуем оформить страницу автора: имя, позиционирование и описание помогают слушателям понять контекст продукта.",
      ],
    },
  ],
  cta: {
    label: "Создать аудиопродукт",
    href: "/author-dashboard/products/new",
  },
};
