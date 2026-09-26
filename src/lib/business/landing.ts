import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

/** Public contact already printed in the site footer. Not a new inbox. */
export const BUSINESS_INQUIRY_EMAIL = "1@audiolad.ru";

export const BUSINESS_LANDING_PATH = "/b";

export const BUSINESS_LANDING_CANONICAL = `${PRODUCTION_APP_ORIGIN}${BUSINESS_LANDING_PATH}`;

export const BUSINESS_LANDING_TITLE =
  "Музыка для бизнеса – Аудиолад Бизнес";

export const BUSINESS_LANDING_DESCRIPTION =
  "Музыка для вашего бизнеса: послушайте опубликованные примеры и откройте документы, которые уже есть на сайте. Аудиолад Бизнес.";

export const BUSINESS_LANDING_H1 =
  "Музыка для вашего бизнеса — быстро, просто, легально";

export const BUSINESS_LANDING_SUBCOPY =
  "Без лишних забот на старте: послушайте примеры и держите опубликованные условия под рукой.";

export const BUSINESS_PICK_LABEL = "Подобрать музыку";
export const BUSINESS_LISTEN_LABEL = "Послушать";
export const BUSINESS_HOW_LABEL = "Начните за несколько минут";

export const BUSINESS_UNIFYING =
  "С музыкой в вашем бизнесе больше ничего не нужно решать.";

export const BUSINESS_CLOSER =
  "Одной заботой в вашем бизнесе становится меньше.";

export const BUSINESS_ASSET_FILES = [
  "01-business-music.webp",
  "02-spa-massage.webp",
  "03-beauty-salon.webp",
  "04-cafe-coffee.webp",
  "05-retail-boutique.webp",
  "06-dental-clinic.webp",
  "07-restaurants.webp",
  "08-business-centers.webp",
  "09-hotels.webp",
  "10-how-it-works.webp",
  "11-rights-documents.webp",
  "12-free-trial.webp",
  "13-handshake-agreement.webp",
  "14-legal-music-banner.webp",
  "15-authoritative-sources.webp",
  "16-what-law-says.webp",
  "17-rao-explains.webp",
  "18-real-world-practice.webp",
  "19-gk-rf.webp",
  "20-rospatent.webp",
  "21-supreme-court.webp",
  "22-rao.webp",
  "23-kommersant.webp",
  "24-rbc.webp",
] as const;

export function businessAssetPath(
  file: (typeof BUSINESS_ASSET_FILES)[number],
): string {
  return `/business/${file}`;
}

/**
 * Industry pages are not created in this change.
 * Cards stay non-links so they cannot 404.
 * Order follows asset numbers 02–09.
 */
export const BUSINESS_VENUES = [
  {
    id: "spa",
    file: "02-spa-massage.webp",
    name: "SPA и массаж",
    futurePath: "/b/spa",
  },
  {
    id: "beauty",
    file: "03-beauty-salon.webp",
    name: "Салоны красоты",
    futurePath: "/b/beauty",
  },
  {
    id: "cafe",
    file: "04-cafe-coffee.webp",
    name: "Кафе и кофейни",
    futurePath: "/b/cafe",
  },
  {
    id: "retail",
    file: "05-retail-boutique.webp",
    name: "Магазины",
    futurePath: "/b/retail",
  },
  {
    id: "dentistry",
    file: "06-dental-clinic.webp",
    name: "Стоматологии и клиники",
    futurePath: "/b/dentistry",
  },
  {
    id: "restaurants",
    file: "07-restaurants.webp",
    name: "Рестораны",
    futurePath: "/b/restaurants",
  },
  {
    id: "offices",
    file: "08-business-centers.webp",
    name: "Бизнес-центры и офисы",
    futurePath: "/b/offices",
  },
  {
    id: "hotels",
    file: "09-hotels.webp",
    name: "Отели",
    futurePath: "/b/hotels",
  },
] as const;

export const BUSINESS_BENEFITS = [
  {
    id: "space",
    title: "Подходит вашему пространству",
    text: "Примеры берутся из опубликованной музыки каталога по настроению. Это не сотни станций и не автоматическая подстройка зала.",
  },
  {
    id: "legal",
    title: "Спокойно с юридической стороны",
    text: "Уже опубликованные документы платформы собраны здесь. Отдельный комплект для фонового звучания в бизнесе на странице ещё не выложен.",
  },
  {
    id: "listen-first",
    title: "Сначала можно просто послушать",
    text: "Опубликованный пример включается в общем плеере сайта. Отдельная регистрация бизнеса для этого не нужна.",
  },
] as const;

export const BUSINESS_RELIEF_HEADING = "Вам больше не нужно заниматься музыкой";

export const BUSINESS_RELIEF = [
  {
    id: "register-to-hear",
    text: "регистрироваться, чтобы услышать опубликованный пример",
  },
  {
    id: "hunt-docs",
    text: "искать по сайту документы платформы, которые уже опубликованы",
  },
] as const;

export const BUSINESS_ATMOSPHERE_NOTE =
  "Ориентиры настроения: спокойная, премиальная, лёгкая, современная, энергичная, lounge, jazz, relax. Это слова поиска по каталогу, не переключатель зала.";

export const BUSINESS_STEPS = [
  {
    id: "business",
    title: "Выберите ваш бизнес",
    text: "Посмотрите карточки пространств. Отдельные страницы отраслей ещё не открыты, поэтому карточки никуда не ведут.",
  },
  {
    id: "atmosphere",
    title: "Выберите атмосферу",
    text: "Смотрите на настроение примера. Отдельной кнопки, которая перестраивает зал, на странице нет.",
  },
  {
    id: "play",
    title: "Включите музыку",
    text: "Если подходящая музыка опубликована, она включается в общем плеере. Заглушку со звуком мы не ставим.",
  },
] as const;

export const BUSINESS_FAQ = [
  {
    id: "try",
    question: "Как послушать музыку?",
    answer:
      "На этой странице можно включить опубликованные примеры из каталога, если они подходят по настроению. Если примеров нет, откройте каталог. Отдельный вход для бизнеса пока не подключён.",
  },
  {
    id: "trial",
    question: "Есть ли на странице пробный период и оплата?",
    answer:
      "Нет. Здесь нет регистрации бизнеса, оплаты и пробного доступа. Иллюстрация с пробным сроком не включает такой доступ.",
  },
  {
    id: "price",
    question: "Сколько стоит подключение?",
    answer:
      "Стоимость на странице не указана: опубликованного тарифа нет. Её можно спросить в письме, цену мы не назначаем заранее.",
  },
  {
    id: "locations",
    question: "Можно ли указать несколько точек?",
    answer:
      "Да, укажите число точек в письме. Это заявка на адрес, не кабинет сети и не наблюдение за тем, играет ли музыка.",
  },
  {
    id: "rights-orgs",
    question: "Нужно ли отдельно договариваться с РАО и ВОИС?",
    answer:
      "Это зависит от конкретных прав и от способа использования музыки. Договор с РАО или ВОИС может понадобиться, если нужные права не переданы другим способом. Аудиолад Бизнес не заменяет юридическую консультацию и не обещает, что отдельный договор с этими организациями не нужен.",
  },
  {
    id: "documents",
    question: "Какие документы уже можно прочитать?",
    answer:
      "На сайте опубликованы документы платформы для слушателей: оферта, политика обработки персональных данных, оплата и возврат. Отдельный комплект для фонового звучания в бизнесе здесь не выложен.",
  },
] as const;

export type BusinessSourceLink = {
  id: string;
  name: string;
  logo: (typeof BUSINESS_ASSET_FILES)[number];
  /** Null when the URL was not verified. The logo still renders, without a link. */
  href: string | null;
  linkLabel: string;
};

/**
 * Links are only set after a direct response check.
 * Homepages of media and an unverified TLS chain are left unlinked.
 * These organizations are sources of public information, not endorsements.
 */
export const BUSINESS_SOURCES: readonly BusinessSourceLink[] = [
  {
    id: "gk",
    name: "Гражданский кодекс РФ",
    logo: "19-gk-rf.webp",
    href: "http://pravo.gov.ru/proxy/ips/?docbody=&nd=102110716",
    linkLabel: "Открыть Гражданский кодекс РФ, часть четвертая",
  },
  {
    id: "rospatent",
    name: "Роспатент",
    logo: "20-rospatent.webp",
    href: null,
    linkLabel: "Роспатент",
  },
  {
    id: "supreme-court",
    name: "Верховный суд РФ",
    logo: "21-supreme-court.webp",
    href: "https://www.vsrf.ru/",
    linkLabel: "Открыть официальный сайт Верховного суда РФ",
  },
  {
    id: "rao",
    name: "РАО",
    logo: "22-rao.webp",
    href: "https://rao.ru/for-users/merchants/",
    linkLabel: "Открыть страницу РАО для торговых предприятий",
  },
  {
    id: "kommersant",
    name: "Коммерсантъ",
    logo: "23-kommersant.webp",
    href: null,
    linkLabel: "Коммерсантъ",
  },
  {
    id: "rbc",
    name: "РБК",
    logo: "24-rbc.webp",
    href: null,
    linkLabel: "РБК",
  },
];

export const BUSINESS_SOURCES_NOTE =
  "Ссылки ведут на публичные страницы. Это не означает, что эти организации рекомендуют Аудиолад Бизнес.";

/**
 * Cards 16–18 stay off. Do not render them or reserve their height.
 * 16 paraphrases GK RF art. 1270 (public performance needs consent); it is not a literal quote.
 * 17 calls RAO a rightsholder via «например, с РАО» and skips related rights.
 * 18’s footer says RBC; the concrete article that supports the sense is Kommersant
 * (https://www.kommersant.ru/doc/8516425), so the asset attribution does not match.
 */
export const BUSINESS_LEGAL_QUOTE_CARDS_ENABLED = false;

export const BUSINESS_LEGAL_QUOTE_BLOCKER =
  "Цитаты на карточках 16, 17 и 18 не совпали дословно с текстом Гражданского кодекса, страницей РАО и материалом РБК. Блок выключен, цитаты на странице не заменяются.";

export const BUSINESS_LEGAL_QUOTE_CARDS = [
  {
    id: "law",
    file: "16-what-law-says.webp",
    name: "Что говорит закон",
  },
  {
    id: "rao",
    file: "17-rao-explains.webp",
    name: "Что разъясняет РАО",
  },
  {
    id: "practice",
    file: "18-real-world-practice.webp",
    name: "Что происходит на практике",
  },
] as const;

/** No business SEO articles are published. The block is omitted when empty. */
export const BUSINESS_SEO_ARTICLES: readonly {
  slug: string;
  title: string;
  description: string;
}[] = [];

export function buildBusinessSeoArticlePath(slug: string): string {
  return `/b/${slug}`;
}

export type BusinessInquiryInput = {
  name: string;
  email: string;
  company: string;
  locations: string;
  message: string;
};

export type BusinessInquiryField = "name" | "email" | "locations" | "message";

export type BusinessInquiryErrors = Partial<
  Record<BusinessInquiryField, string>
>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateBusinessInquiry(
  input: BusinessInquiryInput,
): BusinessInquiryErrors {
  const errors: BusinessInquiryErrors = {};
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  const locations = Number(input.locations);

  if (name.length < 2) {
    errors.name = "Укажите имя.";
  }

  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    errors.email = "Проверьте адрес электронной почты.";
  }

  if (!Number.isInteger(locations) || locations < 1 || locations > 10000) {
    errors.locations = "Укажите число точек от 1 до 10000.";
  }

  if (message.length > 1000) {
    errors.message = "Комментарий длиннее 1000 символов.";
  }

  return errors;
}

export function hasBusinessInquiryErrors(
  errors: BusinessInquiryErrors,
): boolean {
  return Object.keys(errors).length > 0;
}

export function buildBusinessInquiryMailto(input: BusinessInquiryInput): string {
  const locations = Number(input.locations);
  const lines = [
    `Имя: ${input.name.trim()}`,
    `Эл. почта: ${input.email.trim()}`,
    input.company.trim() ? `Компания: ${input.company.trim()}` : null,
    `Количество точек: ${locations}`,
    input.message.trim() ? `Комментарий: ${input.message.trim()}` : null,
    `Страница: ${BUSINESS_LANDING_CANONICAL}`,
  ].filter((line): line is string => Boolean(line));

  const params = new URLSearchParams({
    subject: "Заявка: Аудиолад Бизнес",
    body: lines.join("\n"),
  });

  return `mailto:${BUSINESS_INQUIRY_EMAIL}?${params.toString()}`;
}

export function listBusinessLandingCopy(): string[] {
  return [
    BUSINESS_LANDING_TITLE,
    BUSINESS_LANDING_DESCRIPTION,
    BUSINESS_LANDING_H1,
    BUSINESS_LANDING_SUBCOPY,
    BUSINESS_PICK_LABEL,
    BUSINESS_LISTEN_LABEL,
    BUSINESS_HOW_LABEL,
    BUSINESS_UNIFYING,
    BUSINESS_CLOSER,
    BUSINESS_RELIEF_HEADING,
    BUSINESS_ATMOSPHERE_NOTE,
    BUSINESS_SOURCES_NOTE,
    ...BUSINESS_BENEFITS.flatMap((item) => [item.title, item.text]),
    ...BUSINESS_RELIEF.map((item) => item.text),
    ...BUSINESS_STEPS.flatMap((item) => [item.title, item.text]),
    ...BUSINESS_FAQ.flatMap((item) => [item.question, item.answer]),
    ...BUSINESS_VENUES.map((item) => item.name),
    ...BUSINESS_SOURCES.flatMap((item) => [item.name, item.linkLabel]),
  ];
}
