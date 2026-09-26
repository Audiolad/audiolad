import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

/** Public contact already printed in the site footer. Not a new inbox. */
export const BUSINESS_INQUIRY_EMAIL = "1@audiolad.ru";

export const BUSINESS_LANDING_PATH = "/b";

export const BUSINESS_LANDING_CANONICAL = `${PRODUCTION_APP_ORIGIN}${BUSINESS_LANDING_PATH}`;

export const BUSINESS_LANDING_TITLE =
  "Музыка для бизнеса – Аудиолад Бизнес";

export const BUSINESS_LANDING_DESCRIPTION =
  "Музыка для вашего бизнеса – быстро, просто, легально. Без надоедливых повторов и лишних забот. Работает даже без интернета. Аудиолад Бизнес.";

export const BUSINESS_LANDING_H1 =
  "Музыка для вашего бизнеса – быстро, просто, легально";

export const BUSINESS_LANDING_SUBCOPY =
  "Без надоедливых повторов и лишних забот. Работает даже без интернета.";

export const BUSINESS_HERO_MICRO =
  "Настраивается под атмосферу и ритм вашего бизнеса.";

export const BUSINESS_PICK_LABEL = "Подобрать музыку";
export const BUSINESS_LISTEN_LABEL = "Послушать";
export const BUSINESS_HOW_LABEL = "Начните за несколько минут";

export const BUSINESS_UNIFYING =
  "С музыкой в вашем бизнесе больше ничего не нужно решать.";

export const BUSINESS_CLOSER = "Одной заботой становится меньше.";

export const BUSINESS_TRIAL_FREE = "7 дней бесплатно";
export const BUSINESS_TRIAL_CARD = "Без привязки карты";
export const BUSINESS_HERO_TRUST = "7 дней бесплатно · без привязки карты";

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
    imageAlt: "Кабинет массажа со светлой кушеткой",
    futurePath: "/b/spa",
  },
  {
    id: "beauty",
    file: "03-beauty-salon.webp",
    name: "Салоны красоты",
    imageAlt: "Кресло и зеркало в салоне красоты",
    futurePath: "/b/beauty",
  },
  {
    id: "cafe",
    file: "04-cafe-coffee.webp",
    name: "Кафе и кофейни",
    imageAlt: "Чашка кофе на мраморном столе",
    futurePath: "/b/cafe",
  },
  {
    id: "retail",
    file: "05-retail-boutique.webp",
    name: "Магазины",
    imageAlt: "Бутик одежды со стойкой и вешалками",
    futurePath: "/b/retail",
  },
  {
    id: "dentistry",
    file: "06-dental-clinic.webp",
    name: "Стоматологии и клиники",
    imageAlt: "Стоматологическое кресло в светлом кабинете",
    futurePath: "/b/dentistry",
  },
  {
    id: "restaurants",
    file: "07-restaurants.webp",
    name: "Рестораны",
    imageAlt: "Сервировка стола в ресторане",
    futurePath: "/b/restaurants",
  },
  {
    id: "offices",
    file: "08-business-centers.webp",
    name: "Бизнес-центры и офисы",
    imageAlt: "Стойка ресепшен в офисе",
    futurePath: "/b/offices",
  },
  {
    id: "hotels",
    file: "09-hotels.webp",
    name: "Отели",
    imageAlt: "Стойка регистрации в лобби отеля",
    futurePath: "/b/hotels",
  },
] as const;

export const BUSINESS_BENEFITS = [
  {
    id: "norepeat",
    title: "Музыка не надоедает",
    text: "Без постоянных повторов одних и тех же треков и исполнителей.",
  },
  {
    id: "space",
    title: "Подходит вашему пространству",
    text: "Музыка подбирается под формат бизнеса, атмосферу и время дня.",
  },
  {
    id: "legal",
    title: "Спокойно с юридической стороны",
    text: "Права и документы для коммерческого использования – в одном месте.",
  },
  {
    id: "offline",
    title: "Работает даже без интернета",
    text: "Если связь временно пропадёт, музыка продолжит играть.",
  },
] as const;

export const BUSINESS_RELIEF_HEADING = "Вам больше не нужно заниматься музыкой";

export const BUSINESS_RELIEF = [
  { id: "search", text: "искать музыку каждый день" },
  { id: "playlists", text: "вручную собирать плейлисты" },
  { id: "loop", text: "слушать одни и те же композиции по кругу" },
  { id: "dayparts", text: "менять музыку вручную утром, днём и вечером" },
  { id: "offline", text: "переживать, что музыка остановится из-за интернета" },
  { id: "staff", text: "контролировать, что включил персонал" },
  { id: "rights", text: "самостоятельно разбираться в правах и документах" },
  { id: "sites", text: "отдельно следить за каждой точкой" },
] as const;

export const BUSINESS_RELIEF_CLOSER =
  "Аудиолад занимается музыкой. Вы занимаетесь своим бизнесом.";

export const BUSINESS_HOW_NOTE = "Без обязательных звонков менеджеру.";
export const BUSINESS_HOW_HELP = "Нужна помощь? Мы рядом.";

export const BUSINESS_FORMATS = [
  { id: "spa", name: "SPA" },
  { id: "massage", name: "Массаж" },
  { id: "beauty", name: "Салон красоты" },
  { id: "cafe", name: "Кафе" },
  { id: "restaurant", name: "Ресторан" },
  { id: "shop", name: "Магазин" },
  { id: "hotel", name: "Отель" },
  { id: "clinic", name: "Клиника" },
  { id: "office", name: "Офис" },
  { id: "fitness", name: "Фитнес" },
] as const;

export const BUSINESS_ATMOSPHERES = [
  "Спокойная",
  "Премиальная",
  "Лёгкая",
  "Современная",
  "Энергичная",
  "Lounge",
  "Jazz",
  "Relax",
] as const;

export const BUSINESS_LISTEN_LEAD =
  "Выберите формат и атмосферу. Аудиолад подбирает музыку под ваш зал: без сотен станций и без ручной сборки плейлистов.";
export const BUSINESS_LISTEN_MATCHED = "Музыка подобрана под выбранную атмосферу";
export const BUSINESS_LISTEN_PLAY = "Послушать музыку";

export const BUSINESS_VARIETY_TITLE = "Музыка, которая не надоедает";
export const BUSINESS_VARIETY_LEAD =
  "Одни и те же треки и исполнители не будут звучать по кругу весь рабочий день.";
export const BUSINESS_VARIETY_BODY =
  "Аудиолад следит за разнообразием музыки, сохраняя выбранную атмосферу.";
export const BUSINESS_VARIETY_POINTS = [
  "Без повторов одних и тех же треков",
  "Исполнители не идут по кругу",
  "Разнообразная музыка весь рабочий день",
] as const;

export const BUSINESS_CONTROL_TITLE = "Настройте атмосферу под себя";
export const BUSINESS_CONTROL_LEAD =
  "Музыка работает сама. Владелец может вмешаться, когда хочет другой характер.";
export const BUSINESS_CONTROL_ACTIONS = [
  "Нравится",
  "Не нравится",
  "Пропустить",
  "Меньше такого",
  "Больше такого",
] as const;

export const BUSINESS_DAYPART_TITLE = "Утро, день и вечер звучат по-разному";
export const BUSINESS_DAYPART_LEAD =
  "Аудиолад автоматически меняет характер музыки в течение дня.";
export const BUSINESS_DAYPARTS = [
  { id: "morning", title: "Утро", text: "Легко и спокойно" },
  { id: "day", title: "День", text: "Живее и энергичнее" },
  { id: "evening", title: "Вечер", text: "Мягко и атмосферно" },
] as const;

export const BUSINESS_OFFLINE_TITLE = "Интернет пропал – музыка продолжает играть";
export const BUSINESS_OFFLINE_LEAD =
  "Аудиолад заранее сохраняет запас музыки на устройстве и продолжает воспроизведение при временных проблемах со связью.";

export const BUSINESS_LEGAL_LEAD =
  "Понятные условия. Необходимые документы. Прозрачная информация о правах. Всё в одном месте.";

export const BUSINESS_STAFF_TITLE =
  "Ваш бизнес звучит одинаково – независимо от смены сотрудников";
export const BUSINESS_STAFF_LEAD =
  "Правила задаёт владелец. У смены остаются только разрешённые действия.";
export const BUSINESS_ROLES = [
  { id: "owner", title: "Владелец", text: "Всё" },
  { id: "manager", title: "Управляющий", text: "Разрешённые сценарии" },
  { id: "staff", title: "Сотрудник", text: "Пропустить, спокойнее, энергичнее" },
] as const;

export const BUSINESS_NETWORK_TITLE = "Одна точка сегодня. Сеть завтра.";
export const BUSINESS_NETWORK_LEAD =
  "Добавляйте новые точки в один кабинет и управляйте музыкой централизованно.";
export const BUSINESS_LOCATION_PREVIEW = [
  { id: "cafe", name: "Кофейня", now: "Спокойная", status: "playing" },
  { id: "salon", name: "Салон красоты", now: "Премиальная", status: "playing" },
  { id: "office", name: "Офис", now: "Лёгкая", status: "offline" },
] as const;

export const BUSINESS_SUPPORT_TITLE = "Если понадобится помощь – мы рядом";
export const BUSINESS_SUPPORT_LEAD =
  "Поможем с подключением, настройкой музыки и работой сервиса.";
export const BUSINESS_SUPPORT_NOTE = "Менеджер – только если вы сами этого хотите.";

export const BUSINESS_PRICE_TITLE = "Понятная цена. Никаких неожиданных списаний.";
export const BUSINESS_PRICE_ROWS = [
  { id: "point", title: "Цена точки", text: "Одна понятная сумма за точку, до оплаты." },
  { id: "zones", title: "Зоны", text: "Отдельные зоны пространства, если они нужны." },
  { id: "next", title: "Следующее списание", text: "Дата и состав периода видны заранее." },
  { id: "included", title: "Что входит", text: "Музыка для зала, документы и помощь." },
  { id: "cancel", title: "Отмена", text: "Отмена в кабинете, без скрытых условий." },
] as const;

export const BUSINESS_STEPS = [
  {
    id: "business",
    title: "Выберите ваш бизнес",
    text: "Кафе, салон, клиника, офис или другое пространство.",
  },
  {
    id: "atmosphere",
    title: "Выберите атмосферу",
    text: "Характер музыки под ваш зал: от спокойной до энергичной.",
  },
  {
    id: "play",
    title: "Включите музыку",
    text: "Дальше музыкой занимается Аудиолад.",
  },
] as const;

export const BUSINESS_FAQ = [
  {
    id: "try",
    question: "Как послушать музыку?",
    answer:
      "Выберите тип бизнеса и атмосферу, затем включите музыку. Аудиолад подбирает её под ваш зал.",
  },
  {
    id: "trial",
    question: "Как устроен бесплатный период?",
    answer:
      "7 дней бесплатно и без привязки карты. Сначала слушаете музыку для своего бизнеса, затем пользуетесь периодом и подключаете оплату, когда она нужна.",
  },
  {
    id: "price",
    question: "Как устроена цена?",
    answer:
      "Цена понятная: без неожиданных списаний. Сумма за точку и зоны показывается до оплаты. На этой странице цифры не публикуются.",
  },
  {
    id: "locations",
    question: "Можно ли подключить несколько точек?",
    answer:
      "Да. Новые точки добавляются в один кабинет, музыкой сети управляют централизованно.",
  },
  {
    id: "rights-orgs",
    question: "Нужно ли отдельно договариваться с РАО и ВОИС?",
    answer:
      "Это зависит от конкретных прав и от способа использования музыки. Договор с РАО или ВОИС может понадобиться, если нужные права не переданы другим способом. Аудиолад Бизнес не заменяет юридическую консультацию и не обещает, что отдельный договор с этими организациями не нужен.",
  },
  {
    id: "documents",
    question: "Где документы для коммерческого использования?",
    answer:
      "Права и документы собраны в одном месте: понятные условия, сведения о правах и порядок оплаты.",
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
    BUSINESS_HERO_MICRO,
    BUSINESS_PICK_LABEL,
    BUSINESS_LISTEN_LABEL,
    BUSINESS_HOW_LABEL,
    BUSINESS_HOW_NOTE,
    BUSINESS_HOW_HELP,
    BUSINESS_UNIFYING,
    BUSINESS_CLOSER,
    BUSINESS_TRIAL_FREE,
    BUSINESS_TRIAL_CARD,
    BUSINESS_HERO_TRUST,
    BUSINESS_LISTEN_MATCHED,
    BUSINESS_LISTEN_PLAY,
    BUSINESS_RELIEF_HEADING,
    BUSINESS_RELIEF_CLOSER,
    BUSINESS_LISTEN_LEAD,
    BUSINESS_VARIETY_TITLE,
    BUSINESS_VARIETY_LEAD,
    BUSINESS_VARIETY_BODY,
    ...BUSINESS_VARIETY_POINTS,
    BUSINESS_CONTROL_TITLE,
    BUSINESS_CONTROL_LEAD,
    BUSINESS_DAYPART_TITLE,
    BUSINESS_DAYPART_LEAD,
    BUSINESS_OFFLINE_TITLE,
    BUSINESS_OFFLINE_LEAD,
    BUSINESS_LEGAL_LEAD,
    BUSINESS_STAFF_TITLE,
    BUSINESS_STAFF_LEAD,
    BUSINESS_NETWORK_TITLE,
    BUSINESS_NETWORK_LEAD,
    BUSINESS_SUPPORT_TITLE,
    BUSINESS_SUPPORT_LEAD,
    BUSINESS_SUPPORT_NOTE,
    BUSINESS_PRICE_TITLE,
    BUSINESS_SOURCES_NOTE,
    ...BUSINESS_BENEFITS.flatMap((item) => [item.title, item.text]),
    ...BUSINESS_RELIEF.map((item) => item.text),
    ...BUSINESS_STEPS.flatMap((item) => [item.title, item.text]),
    ...BUSINESS_FORMATS.map((item) => item.name),
    ...BUSINESS_ATMOSPHERES,
    ...BUSINESS_CONTROL_ACTIONS,
    ...BUSINESS_DAYPARTS.flatMap((item) => [item.title, item.text]),
    ...BUSINESS_ROLES.flatMap((item) => [item.title, item.text]),
    ...BUSINESS_LOCATION_PREVIEW.flatMap((item) => [item.name, item.now, item.status]),
    ...BUSINESS_PRICE_ROWS.flatMap((item) => [item.title, item.text]),
    ...BUSINESS_FAQ.flatMap((item) => [item.question, item.answer]),
    ...BUSINESS_VENUES.map((item) => item.name),
    ...BUSINESS_SOURCES.flatMap((item) => [item.name, item.linkLabel]),
  ];
}
