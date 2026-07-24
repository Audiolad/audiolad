import type { TopicHubDefinition } from "./types";

/**
 * Editorial SEO hubs. Platform directory remains `topics` (key/slug like self-worth).
 * Hub slug may be Russian SEO-friendly and must not replace topics.key.
 */
export const TOPIC_HUB_DEFINITIONS: readonly TopicHubDefinition[] = [
  {
    slug: "lyubov-k-sebe",
    topicKey: "self-worth",
    title: "Любовь к себе",
    metaDescription:
      "Аудиопрактики и медитации про любовь к себе, принятие себя и самоценность на АудиоЛаде. Слушайте бесплатные и платные практики онлайн.",
    intro:
      "Подборка аудиопрактик для мягкого возвращения к себе: принятие, самоценность, внутреннее тепло и уверенность без давления «быть идеальной».",
    body: [
      "Любовь к себе в поиске часто формулируют как «принятие себя», «самоценность» или «уверенность». На АудиоЛаде эти запросы собраны вокруг платформенной темы «Уверенность и самоценность»: здесь практики, которые помогают снизить внутреннюю критику и услышать себя спокойнее.",
      "Начните с бесплатной практики, если хотите просто послушать. Если откликается более глубокая работа – перейдите к программе или циклу того же автора. Страница обновляется автоматически по опубликованным практикам темы.",
    ],
    faq: [
      {
        question: "Чем любовь к себе отличается от уверенности и самоценности?",
        answer:
          "В поиске это близкие формулировки одного намерения – относиться к себе бережнее. В каталоге АудиоЛада они объединены платформенной темой «Уверенность и самоценность», а эта страница собрана под самый частый пользовательский запрос «любовь к себе».",
      },
      {
        question: "Можно ли слушать практики бесплатно?",
        answer:
          "Да. В подборке есть бесплатные практики – они отмечены отдельно. Платные программы открываются после покупки или по правилам доступа автора.",
      },
      {
        question: "Это лечение или психотерапия?",
        answer:
          "Нет. Аудиопрактики АудиоЛада – это инструменты для самонаблюдения, расслабления и внутренней настройки. Они не заменяют консультацию врача или психотерапевта.",
      },
      {
        question: "Как выбрать первую практику?",
        answer:
          "Если тема новая – начните с короткой бесплатной практики. Если уже есть запрос на отношения с собой или женскую силу – посмотрите практики с явным акцентом на принятие и самоценность в описании.",
      },
    ],
    relatedLinks: [
      {
        href: "/catalog?topic=self-worth",
        title: "Все практики темы в каталоге",
        description: "Фильтр каталога по теме «Уверенность и самоценность»",
      },
      {
        href: "/catalog?topic=relationships",
        title: "Практики про отношения",
        description: "Рядом по смыслу – отношения с собой и с другими",
      },
      {
        href: "/authors",
        title: "Авторы АудиоЛада",
        description: "Выбрать автора и его каталог",
      },
    ],
  },
] as const;

const HUBS_BY_SLUG = new Map(
  TOPIC_HUB_DEFINITIONS.map((hub) => [hub.slug, hub] as const),
);

const HUBS_BY_TOPIC_KEY = new Map(
  TOPIC_HUB_DEFINITIONS.map((hub) => [hub.topicKey, hub] as const),
);

export function listTopicHubDefinitions(): readonly TopicHubDefinition[] {
  return TOPIC_HUB_DEFINITIONS;
}

export function getTopicHubBySlug(slug: string): TopicHubDefinition | null {
  const normalized = slug.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return HUBS_BY_SLUG.get(normalized) ?? null;
}

export function getTopicHubByTopicKey(topicKey: string): TopicHubDefinition | null {
  const normalized = topicKey.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return HUBS_BY_TOPIC_KEY.get(normalized) ?? null;
}

export function listTopicHubSlugs(): string[] {
  return TOPIC_HUB_DEFINITIONS.map((hub) => hub.slug);
}
