import type {
  SeoQueryAudioFit,
  SeoQueryDisposition,
  SeoQueryFormat,
  SeoQueryIntent,
} from "./analysis-taxonomy";

export {
  SEO_QUERY_AUDIO_FITS,
  SEO_QUERY_FORMATS,
  SEO_QUERY_INTENTS,
} from "./analysis-taxonomy";
export type {
  SeoQueryAudioFit,
  SeoQueryDisposition,
  SeoQueryFormat,
  SeoQueryIntent,
} from "./analysis-taxonomy";

export type SeoQueryClassification = {
  intent: SeoQueryIntent;
  recommendedFormat: SeoQueryFormat | null;
  audioFit: SeoQueryAudioFit;
  recommendedDisposition: SeoQueryDisposition;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

function has(text: string, expression: RegExp) { return expression.test(text); }

/** Pure conservative recommendation. Persistence and final review remain admin-only. */
export function classifySeoQuery({ queryText }: { queryText: string }): SeoQueryClassification {
  const text = queryText.toLowerCase().trim();
  if (has(text, /(войти|вход|логин|регистрация|личный кабинет|официальный сайт|адрес|контакты)/)) {
    return { intent: "navigation", recommendedFormat: null, audioFit: "none", recommendedDisposition: "not_applicable", confidence: "high", reasons: ["Навигационный запрос не является аудио-возможностью."] };
  }
  if (has(text, /(купить|цена|стоимость|заказать|скачать)/)) {
    return { intent: "transactional", recommendedFormat: null, audioFit: "none", recommendedDisposition: "not_applicable", confidence: "high", reasons: ["Коммерческий запрос не является аудио-возможностью."] };
  }
  if (has(text, /(сейчас|сегодня|завтра|погода|курс валют|новости|онлайн трансляция)/)) {
    return { intent: "realtime", recommendedFormat: null, audioFit: "none", recommendedDisposition: "not_applicable", confidence: "high", reasons: ["Запрос зависит от текущих данных."] };
  }
  if (has(text, /(музыка|джаз|классическ\w* музыка|фонов\w* музыка)/)) {
    return { intent: "music", recommendedFormat: "Музыка", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный музыкальный сигнал."] };
  }
  if (has(text, /молитв\w*/)) {
    return { intent: "practice", recommendedFormat: "Молитва", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный сигнал молитвы."] };
  }
  if (has(text, /(аудиокниг\w*|слушать книг\w*)/)) {
    return { intent: "specific_content", recommendedFormat: "Аудиокнига", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Запрос явно относится к аудиокниге."] };
  }
  if (has(text, /энергопрактик\w*/)) {
    return { intent: "practice", recommendedFormat: "Энергопрактика", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный сигнал энергопрактики."] };
  }
  if (has(text, /(медитац\w*|практик\w*)/)) {
    return { intent: "practice", recommendedFormat: "Медитация", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный сигнал медитации или практики."] };
  }
  if (has(text, /^(как|как сделать|как научиться)/)) {
    return { intent: "how_to", recommendedFormat: "Лекция", audioFit: "medium", recommendedDisposition: "analyzed", confidence: "medium", reasons: ["Вопрос предполагает объяснение или инструкцию."] };
  }
  if (has(text, /^(что такое|почему|зачем|признаки|значение)/)) {
    return { intent: "informational", recommendedFormat: "Лекция", audioFit: "medium", recommendedDisposition: "analyzed", confidence: "medium", reasons: ["Запрос носит справочный характер."] };
  }
  if (has(text, /(история|мой опыт|как я)/)) {
    return { intent: "experience_story", recommendedFormat: "Подкаст", audioFit: "medium", recommendedDisposition: "analyzed", confidence: "medium", reasons: ["Есть сигнал личной истории или опыта."] };
  }
  if (has(text, /(слушать|слушать онлайн|аудио|с голосом|без голоса)/)) {
    return { intent: "listen_audio", recommendedFormat: null, audioFit: "high", recommendedDisposition: "analyzed", confidence: "medium", reasons: ["Есть явное намерение слушать аудио."] };
  }
  return { intent: "other", recommendedFormat: null, audioFit: "low", recommendedDisposition: "not_applicable", confidence: "low", reasons: ["Явного аудио-намерения не обнаружено; требуется решение администратора."] };
}
