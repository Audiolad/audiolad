import { MAX_MINI_APP_BOT_NAME, MAX_MINI_APP_DEEP_LINK_ORIGIN } from "@/lib/max/startapp";

export const AUDIOLAD_MAX_ARTICLE = {
  path: "/audiolad-max",
  title: "АудиоЛад Макс (MAX) – как открыть мини-приложение и сохранить ссылку",
  description:
    "Прямая ссылка на АудиоЛад в MAX. Как открыть мини-приложение, слушать музыку и медитации и сохранить ссылку в «Избранном» или с помощью папки с чатами.",
  breadcrumbTitle: "АудиоЛад Макс",
  publishedAt: "2026-11-25",
  topicSlug: "audiolad",
  topicTitle: "АудиоЛад",
  readingTimeMinutes: 1,
};

export const AUDIOLAD_MAX_BOT_URL = `${MAX_MINI_APP_DEEP_LINK_ORIGIN}/${MAX_MINI_APP_BOT_NAME}`;
