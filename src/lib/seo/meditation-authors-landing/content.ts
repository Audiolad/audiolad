export const MEDITATION_AUTHORS_LANDING_PATH = "/dlya-avtorov-meditatsiy";

export const MEDITATION_AUTHORS_LANDING_DATE_PUBLISHED = "2026-09-19";

export const MEDITATION_AUTHORS_LANDING_SEO_TITLE =
  "Создавайте и публикуйте свои медитации на АудиоЛад";

export const MEDITATION_AUTHORS_LANDING_SEO_DESCRIPTION =
  "Превратите знания, голос и практики в аудиопродукты. Публикуйте медитации, создавайте программы, находите слушателей через поиск и зарабатывайте на своём творчестве.";

export const MEDITATION_AUTHORS_LANDING_PAGE_H1 =
  "Создавайте и публикуйте свои медитации на АудиоЛад";

export const MEDITATION_AUTHORS_LANDING_BREADCRUMB_TITLE =
  "Авторам медитаций";

export const MEDITATION_AUTHORS_LANDING_SUBTITLE =
  "Превратите свои знания, голос и практики в полноценные аудиопродукты. Публикуйте медитации, создавайте программы, находите новых слушателей и зарабатывайте на своём творчестве.";

export const MEDITATION_AUTHORS_LANDING_PRIMARY_CTA = "Стать автором бесплатно";

export const MEDITATION_AUTHORS_LANDING_SECONDARY_CTA = "Открыть Студию";

export const MEDITATION_AUTHORS_LANDING_STUDIO_HREF = "/studio/meditation";

export const MEDITATION_AUTHORS_LANDING_BENEFITS_HEADING =
  "Всё, что нужно автору медитаций — в одном пространстве";

export type MeditationAuthorsBenefitId =
  | "author-page"
  | "publish"
  | "studio"
  | "free-paid"
  | "search"
  | "programs"
  | "earn";

export type MeditationAuthorsBenefit = {
  id: MeditationAuthorsBenefitId;
  title: string;
  text: string;
  visualLabel: string;
  width: number;
  height: number;
  /** null until final asset is uploaded to public/images/meditation-authors-landing/ */
  src: string | null;
};

export const MEDITATION_AUTHORS_LANDING_BENEFITS: readonly MeditationAuthorsBenefit[] =
  [
    {
      id: "author-page",
      title: "Собственная страница автора",
      text: "Расскажите о себе, своём направлении и соберите все свои практики в одном пространстве.",
      visualLabel: "Слот: страница автора",
      width: 960,
      height: 720,
      src: null,
    },
    {
      id: "publish",
      title: "Публикуйте медитации и практики",
      text: "Размещайте медитации, практики, лекции, молитвы, музыку и другие авторские аудиоформаты.",
      visualLabel: "Слот: карточки практик",
      width: 960,
      height: 720,
      src: null,
    },
    {
      id: "studio",
      title: "Создавайте прямо в Студии",
      text: "Записывайте голос, добавляйте музыку и собирайте готовую практику внутри платформы.",
      visualLabel: "Слот: интерфейс Студии",
      width: 960,
      height: 720,
      src: null,
    },
    {
      id: "free-paid",
      title: "Бесплатные и платные продукты",
      text: "Открывайте часть материалов для знакомства и создавайте платные продукты для продолжения работы.",
      visualLabel: "Слот: free / paid",
      width: 960,
      height: 720,
      src: null,
    },
    {
      id: "search",
      title: "Получайте новых слушателей через поиск",
      text: "АудиоЛад помогает вашим практикам продвигаться через поиск и находить свою аудиторию.",
      visualLabel: "Слот: поиск → практика",
      width: 960,
      height: 720,
      src: null,
    },
    {
      id: "programs",
      title: "Объединяйте практики в программы",
      text: "Создавайте не только отдельные медитации, но и полноценные программы и курсы.",
      visualLabel: "Слот: программа из аудио",
      width: 960,
      height: 720,
      src: null,
    },
    {
      id: "earn",
      title: "Зарабатывайте на своих аудиоматериалах",
      text: "Публикуйте платные продукты и постепенно превращайте своё творчество в доход.",
      visualLabel: "Слот: авторский доход",
      width: 960,
      height: 720,
      src: null,
    },
  ];

export const MEDITATION_AUTHORS_LANDING_STUDIO_HEADING =
  "Создавайте медитации прямо в Студии АудиоЛад";

export const MEDITATION_AUTHORS_LANDING_STUDIO_TEXT: readonly string[] = [
  "Если у вас уже есть текст или идея практики, вам не обязательно осваивать сложные программы для работы со звуком.",
  "В Студии АудиоЛад можно загрузить или записать голос, добавить музыку, собрать несколько аудиодорожек и подготовить готовую медитацию.",
  "После этого её можно опубликовать на АудиоЛаде и добавить в своё авторское пространство.",
];

export const MEDITATION_AUTHORS_LANDING_SPACE_HEADING =
  "Создайте своё авторское пространство";

export const MEDITATION_AUTHORS_LANDING_SPACE_TEXT: readonly string[] = [
  "АудиоЛад — это платформа, созданная вокруг аудиоконтента.",
  "Здесь люди приходят слушать медитации, практики, музыку, аудиокурсы, программы и другие авторские материалы.",
  "У каждого вашего продукта может быть собственное название, обложка, описание, аудиоплеер и отдельная страница.",
  "А все опубликованные материалы объединяются на вашей странице автора.",
  "Так постепенно одна медитация может превратиться в целую библиотеку ваших работ.",
];

export const MEDITATION_AUTHORS_LANDING_INTRO_HEADING =
  "Позвольте слушателю сначала познакомиться с вами";

export const MEDITATION_AUTHORS_LANDING_INTRO_TEXT: readonly string[] = [
  "Человеку проще выбрать автора, когда он уже услышал его голос и попробовал одну из его практик.",
  "Поэтому часть материалов можно публиковать бесплатно.",
  "Создайте небольшую медитацию или практику, дайте слушателю познакомиться с вашим подходом, а затем предложите ему другие аудиопродукты и более глубокие программы.",
  "АудиоЛад позволяет выстраивать этот путь внутри одного пространства — от первого знакомства с автором до его следующих продуктов.",
];

export const MEDITATION_AUTHORS_LANDING_SEARCH_HEADING =
  "Получайте новых слушателей через Яндекс и Google";

export const MEDITATION_AUTHORS_LANDING_SEARCH_LEAD =
  "Вам не нужно самим собирать аудиторию слушателей. АудиоЛад помогает вашим практикам продвигаться через поиск и находить свою аудиторию.";

export const MEDITATION_AUTHORS_LANDING_SEARCH_TEXT: readonly string[] = [
  "Внутри АудиоЛада развивается система поискового продвижения аудиопродуктов и тематических страниц.",
  "Люди ищут в Яндексе и Google медитации для сна и расслабления, утренние и вечерние практики, психологические практики, материалы для работы с состоянием, саморазвития и множество других тем.",
  "По таким запросам они могут попадать на страницы АудиоЛада, включать практики и знакомиться с авторами платформы.",
  "Каждая ваша медитация получает собственную страницу и становится частью этой системы.",
  "Чем больше полезных качественных материалов вы публикуете, тем больше точек входа появляется у слушателей, которые ещё не знают вас, но уже ищут именно такую практику.",
];

export const MEDITATION_AUTHORS_LANDING_SEARCH_CLOSING =
  "Вы создаёте качественные аудиопрактики — АудиоЛад помогает им встретиться со своей аудиторией.";

export const MEDITATION_AUTHORS_LANDING_MONETIZATION_HEADING =
  "Превращайте практики в продукты и доход";

export const MEDITATION_AUTHORS_LANDING_MONETIZATION_TEXT: readonly string[] = [
  "На АудиоЛаде вы можете выстраивать понятную авторскую линейку продуктов.",
  "Часть материалов можно оставить открытыми для знакомства со слушателем.",
  "Более глубокие практики, программы и последовательные аудиокурсы можно оформлять как платные продукты.",
  "Так постепенно ваше творчество превращается не только в полезный контент, но и в полноценную авторскую аудиотеку, которая может приносить доход.",
];

export const MEDITATION_AUTHORS_LANDING_MONETIZATION_CARDS: readonly {
  id: "free" | "paid" | "program";
  title: string;
  hint: string;
}[] = [
  {
    id: "free",
    title: "Бесплатная практика",
    hint: "Знакомство с голосом и подходом автора",
  },
  {
    id: "paid",
    title: "Платный продукт",
    hint: "Более глубокая практика или курс",
  },
  {
    id: "program",
    title: "Программа",
    hint: "Несколько аудио в одном пространстве",
  },
];

export const MEDITATION_AUTHORS_LANDING_STEPS_HEADING =
  "Начать можно с одной медитации";

export const MEDITATION_AUTHORS_LANDING_STEPS: readonly {
  id: string;
  title: string;
  text: string;
}[] = [
  {
    id: "1",
    title: "Станьте автором",
    text: "Создайте свою страницу автора и получите доступ к кабинету.",
  },
  {
    id: "2",
    title: "Добавьте первую практику",
    text: "Загрузите готовое аудио или создайте медитацию в Студии АудиоЛад.",
  },
  {
    id: "3",
    title: "Оформите страницу",
    text: "Добавьте название, описание и обложку.",
  },
  {
    id: "4",
    title: "Публикуйте и развивайтесь",
    text: "Добавляйте новые практики, создавайте программы, находите новых слушателей и развивайте свою аудиотеку.",
  },
];

export const MEDITATION_AUTHORS_LANDING_FINAL_HEADING =
  "Начните создавать своё пространство на АудиоЛад";

export const MEDITATION_AUTHORS_LANDING_FINAL_TEXT: readonly string[] = [
  "У вас уже могут быть знания, опыт, голос и идеи для практик.",
  "Начните с одного аудио.",
  "Опубликуйте первую медитацию, создайте свою страницу автора и постепенно собирайте пространство, в котором новые слушатели смогут находить вас и ваши практики.",
];

export type MeditationAuthorsVisualId =
  | "hero"
  | "studio"
  | "author-space"
  | "listener-intro"
  | "search-funnel"
  | "final-cta";

export type MeditationAuthorsVisual = {
  id: MeditationAuthorsVisualId;
  alt: string;
  placeholderLabel: string;
  width: number;
  height: number;
  src: string | null;
};

export const MEDITATION_AUTHORS_LANDING_VISUALS: readonly MeditationAuthorsVisual[] =
  [
    {
      id: "hero",
      alt: "Женщина записывает медитацию на смартфон в светлом пространстве",
      placeholderLabel:
        "Hero: женщина 40–50 лет записывает практику на смартфон (без наушников и микрофона)",
      width: 1200,
      height: 1400,
      src: null,
    },
    {
      id: "studio",
      alt: "Интерфейс Студии АудиоЛад с дорожками голоса и музыки",
      placeholderLabel:
        "Студия: реальный скрин (дорожки, голос, музыка, создание MP3)",
      width: 1280,
      height: 900,
      src: null,
    },
    {
      id: "author-space",
      alt: "Страница автора, карточка медитации и библиотека практик",
      placeholderLabel:
        "Авторское пространство: страница автора + карточка + библиотека",
      width: 1280,
      height: 900,
      src: null,
    },
    {
      id: "listener-intro",
      alt: "Слушательница знакомится с автором и следующим продуктом",
      placeholderLabel:
        "Знакомство: слушательница + карточка автора + следующий продукт",
      width: 1280,
      height: 900,
      src: null,
    },
    {
      id: "search-funnel",
      alt: "Путь от поискового запроса к знакомству с автором на АудиоЛаде",
      placeholderLabel:
        "Поиск: запрос → страница АудиоЛада → прослушивание → знакомство с автором",
      width: 1280,
      height: 720,
      src: null,
    },
    {
      id: "final-cta",
      alt: "Автор с опубликованными практиками на АудиоЛаде",
      placeholderLabel:
        "Финал: спокойная сцена с героиней и карточками опубликованных практик",
      width: 1280,
      height: 900,
      src: null,
    },
  ];
