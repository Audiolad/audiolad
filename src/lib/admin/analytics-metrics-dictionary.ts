export type AdminMetricKind =
  | "event"
  | "unique_person"
  | "session"
  | "account"
  | "ratio";

export type AdminMetricDefinition = {
  key: string;
  label: string;
  shortDescription: string;
  kind: AdminMetricKind;
  sqlSource: string;
  formula: string;
  filters: string;
  comparableToMetrika: boolean;
};

export const ADMIN_ANALYTICS_METHOD_NOTES = [
  "Внутренние сессии АудиоЛада — это first-party сессии с общим session_id между вкладками и таймаутом 30 минут. Это не визиты Яндекс.Метрики.",
  "Внутренние посетители считаются через единый visitor_key (user_id или anonymous_id с учётом identity link). Методика Метрики другая, цифры не обязаны совпадать.",
  "При активном переключателе «Не учитывать служебный и тестовый трафик» исключаются is_staff, is_test и is_bot.",
  "Продуктовые действия (просмотры, запуски, дослушивания, сохранения) считаются по first-party событиям analytics_events.",
  "Регистрации считаются по profiles.created_at в базе, а не по клиентской цели signup_completed.",
  "Сохранение в воронке — событие first_manual_library_save («Сохранили практику в Аудиотеку»). PWA install сюда не входит.",
  "Источники/UTM в разрезе — модель session-touch (атрибуты сессии, в которой произошло действие).",
] as const;

export const ADMIN_METRIC_DEFINITIONS: AdminMetricDefinition[] = [
  {
    key: "sessions",
    label: "Внутренние сессии",
    shortDescription: "Сессии внутренней аналитики АудиоЛада за период.",
    kind: "session",
    sqlSource: "analytics_sessions.started_at → admin_analytics_p2_summary.audience.sessions",
    formula: "COUNT(sessions)",
    filters: "period, staff/test/bot, author/practice/utm/device при активных фильтрах",
    comparableToMetrika: false,
  },
  {
    key: "visitors",
    label: "Внутренние посетители",
    shortDescription: "Уникальные люди по visitor_key.",
    kind: "unique_person",
    sqlSource: "admin_analytics_visitor_key → audience.visitors",
    formula: "COUNT(DISTINCT visitor_key)",
    filters: "те же, что у сессий",
    comparableToMetrika: false,
  },
  {
    key: "registrations",
    label: "Регистрации",
    shortDescription: "Новые профили за период.",
    kind: "account",
    sqlSource: "profiles.created_at",
    formula: "COUNT(profiles) с исключением staff/test",
    filters: "period + staff/test; product-фильтр только при наличии product events у пользователя",
    comparableToMetrika: false,
  },
  {
    key: "practice_views",
    label: "Просмотры практик",
    shortDescription: "События practice_view.",
    kind: "event",
    sqlSource: "analytics_events.event_name = practice_view",
    formula: "COUNT(*)",
    filters: "period, service traffic, author/practice/utm/device",
    comparableToMetrika: false,
  },
  {
    key: "practice_visitors",
    label: "Посетители практик",
    shortDescription: "Уникальные люди с practice_view.",
    kind: "unique_person",
    sqlSource: "practice_view + visitor_key",
    formula: "COUNT(DISTINCT visitor_key)",
    filters: "те же",
    comparableToMetrika: false,
  },
  {
    key: "play_starts",
    label: "Запуски аудио",
    shortDescription: "События audio_play_started.",
    kind: "event",
    sqlSource: "analytics_events.event_name = audio_play_started",
    formula: "COUNT(*)",
    filters: "те же",
    comparableToMetrika: false,
  },
  {
    key: "listeners",
    label: "Уникальные слушатели",
    shortDescription: "Уникальные люди с запуском аудио.",
    kind: "unique_person",
    sqlSource: "audio_play_started + visitor_key",
    formula: "COUNT(DISTINCT visitor_key)",
    filters: "те же",
    comparableToMetrika: false,
  },
  {
    key: "completions",
    label: "Дослушивания",
    shortDescription: "События audio_completed.",
    kind: "event",
    sqlSource: "analytics_events.event_name = audio_completed",
    formula: "COUNT(*)",
    filters: "те же",
    comparableToMetrika: false,
  },
  {
    key: "completers",
    label: "Дослушавшие",
    shortDescription: "Уникальные люди с audio_completed.",
    kind: "unique_person",
    sqlSource: "audio_completed + visitor_key",
    formula: "COUNT(DISTINCT visitor_key)",
    filters: "те же",
    comparableToMetrika: false,
  },
  {
    key: "saves",
    label: "Сохранили практику в Аудиотеку",
    shortDescription: "События first_manual_library_save.",
    kind: "event",
    sqlSource: "analytics_events.event_name = first_manual_library_save",
    formula: "COUNT(*)",
    filters: "те же",
    comparableToMetrika: false,
  },
  {
    key: "savers",
    label: "Сохранившие",
    shortDescription: "Уникальные люди с сохранением в Аудиотеку.",
    kind: "unique_person",
    sqlSource: "first_manual_library_save + visitor_key",
    formula: "COUNT(DISTINCT visitor_key)",
    filters: "те же",
    comparableToMetrika: false,
  },
];

export const METRIKA_DIFF_TOOLTIP =
  "Методика внутренней аналитики АудиоЛада отличается от Яндекс.Метрики, поэтому показатели не обязаны совпадать.";

export function metricKindLabel(kind: AdminMetricKind): string {
  switch (kind) {
    case "event":
      return "события";
    case "unique_person":
      return "люди";
    case "session":
      return "сессии";
    case "account":
      return "аккаунты";
    case "ratio":
      return "доля";
    default:
      return kind;
  }
}
