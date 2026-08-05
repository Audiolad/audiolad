export type SchoolTestimonialResultPart =
  | { type: "text"; value: string }
  | { type: "number"; value: string };

export type SchoolTestimonial = {
  id: string;
  name: string;
  nameGenitive: string;
  result: readonly SchoolTestimonialResultPart[];
  resultNote?: string;
  duration: string;
  vkUrl: string;
  embedUrl: string;
  posterSrc: string;
  posterAlt: string;
  posterPosition?: string;
};

const ALLOWED_EMBED_HOST = "vkvideo.ru";

export function isAllowedVkEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === ALLOWED_EMBED_HOST &&
      parsed.pathname === "/video_ext.php"
    );
  } catch {
    return false;
  }
}

export const SCHOOL_TESTIMONIALS: readonly SchoolTestimonial[] = [
  {
    id: "galina-chikhacheva",
    name: "Галина Чихачёва",
    nameGenitive: "Галины Чихачёвой",
    result: [
      { type: "text", value: "Сделала " },
      { type: "number", value: "25" },
      { type: "text", value: " продаж уже в первые две недели обучения" },
    ],
    duration: "1:37",
    vkUrl: "https://vkvideo.ru/video-142616091_456240066",
    embedUrl:
      "https://vkvideo.ru/video_ext.php?oid=-142616091&id=456240066&hash=ad36af329e9d5aff&hd=3",
    posterSrc: "/school/testimonials/galina-chikhacheva.webp",
    posterAlt: "Галина Чихачёва — видеоистория участницы программы",
  },
  {
    id: "irina-popova",
    name: "Ирина Попова",
    nameGenitive: "Ирины Поповой",
    result: [
      { type: "text", value: "Вышла на стабильный доход " },
      { type: "number", value: "250 000 ₽" },
      {
        type: "text",
        value: " в месяц благодаря работе с мини-группами",
      },
    ],
    duration: "4:56",
    vkUrl: "https://vkvideo.ru/video-142616091_456240070",
    embedUrl:
      "https://vkvideo.ru/video_ext.php?oid=-142616091&id=456240070&hash=44a0afecbb81f072&hd=3",
    posterSrc: "/school/testimonials/irina-popova.webp",
    posterAlt: "Ирина Попова — видеоистория участницы программы",
  },
  {
    id: "zhanna-bakurova",
    name: "Жанна Бакурова",
    nameGenitive: "Жанны Бакуровой",
    result: [
      {
        type: "text",
        value: "Создала свой продукт и впервые продала его онлайн за ",
      },
      { type: "number", value: "60 000 ₽" },
    ],
    duration: "10:35",
    vkUrl: "https://vkvideo.ru/video-142616091_456240069",
    embedUrl:
      "https://vkvideo.ru/video_ext.php?oid=-142616091&id=456240069&hash=0384e4bf3e891e2f&hd=3",
    posterSrc: "/school/testimonials/zhanna-bakurova.webp",
    posterAlt: "Жанна Бакурова — видеоистория участницы программы",
  },
  {
    id: "irina-kuchma",
    name: "Ирина Кучма",
    nameGenitive: "Ирины Кучмы",
    result: [
      { type: "text", value: "Провела " },
      { type: "number", value: "4" },
      { type: "text", value: " мини-группы за " },
      { type: "number", value: "6" },
      { type: "text", value: " месяцев" },
    ],
    resultNote: "Получила опыт запуска собственного группового формата",
    duration: "16:06",
    vkUrl: "https://vkvideo.ru/video-142616091_456240071",
    embedUrl:
      "https://vkvideo.ru/video_ext.php?oid=-142616091&id=456240071&hash=9fbf98b706e4f5be&hd=3",
    posterSrc: "/school/testimonials/irina-kuchma.webp",
    posterAlt: "Ирина Кучма — видеоистория участницы программы",
  },
  {
    id: "nina-pyanova",
    name: "Нина Пьянова",
    nameGenitive: "Нины Пьяновой",
    result: [
      { type: "text", value: "Вышла на новый уровень дохода – " },
      { type: "number", value: "1 037 000 ₽" },
      { type: "text", value: " от своей деятельности" },
    ],
    duration: "16:28",
    vkUrl: "https://vkvideo.ru/video-142616091_456240067",
    embedUrl:
      "https://vkvideo.ru/video_ext.php?oid=-142616091&id=456240067&hash=5e68b61f05e9b643&hd=3",
    posterSrc: "/school/testimonials/nina-pyanova.webp",
    posterAlt: "Нина Пьянова — видеоистория участницы программы",
  },
] as const;

export const SCHOOL_TESTIMONIALS_MOBILE_VISIBLE = 3;
