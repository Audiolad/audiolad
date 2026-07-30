import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const publishProductArticle: HelpArticle = {
  id: "help.authors.publish-product",
  slug: "publish-product",
  title: "Как опубликовать аудиопродукт",
  description:
    "Проверьте черновик и выпустите практику или курс в каталог АудиоЛада.",
  category: "authors",
  audience: "author",
  order: 20,
  keywords: [
    "опубликовать практику",
    "публикация",
    "выпустить продукт",
    "каталог",
    "черновик",
    "аудиопродукт",
  ],
  updatedAt: "2026-07-29",
  version: 1,
  relatedRoutes: [
    "/author-dashboard",
    "/author-dashboard/products/new",
  ],
  relatedArticleIds: [
    "help.authors.create-first-product",
    "help.authors.language-and-formatting",
    "help.authors.author-page",
    "help.finance.commercial-status",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Публикация делает продукт доступным слушателям в каталоге. Перед нажатием «Опубликовать» убедитесь, что все обязательные поля заполнены и аудио загружено.",
      ],
    },
    {
      id: "steps",
      title: "Как опубликовать",
      steps: [
        "Откройте кабинет автора → «Продукты» и выберите нужный черновик.",
        "Проверьте название, описание, обложку и аудиоматериалы.",
        "Если продукт платный, убедитесь, что коммерческий статус активен и приняты условия для авторов.",
        "Нажмите «Опубликовать» и дождитесь подтверждения.",
        "После публикации продукт появится в каталоге и на вашей странице автора.",
      ],
    },
    {
      id: "language",
      title: "Язык и оформление материалов",
      paragraphs: [
        helpRich(
          "Перед публикацией убедитесь, что публичные тексты и основные надписи на обложке оформлены преимущественно на русском языке кириллицей. Подробности — в статье ",
          helpPublicLink("/help/authors/language-and-formatting", {
            label: "«Язык и оформление материалов»",
          }),
          ".",
        ),
      ],
    },
    {
      id: "notes",
      title: "Ограничения",
      notes: [
        "Бесплатные продукты можно публиковать на стартовом статусе автора.",
        "Платные продукты и установка цены доступны после коммерческого подключения.",
        "Изменения в опубликованном продукте сохраняются отдельно — следуйте подсказкам формы редактирования.",
      ],
    },
  ],
  cta: {
    label: "Перейти к продуктам",
    href: "/author-dashboard",
  },
};
