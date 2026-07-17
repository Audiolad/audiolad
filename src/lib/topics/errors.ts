import type { TopicErrorCode } from "./types";

const TOPIC_ERROR_MESSAGES: Record<TopicErrorCode, string> = {
  topic_not_found: "Выбранная тема недоступна.",
  topic_limit_exceeded: "Для вашего тарифа можно выбрать не более 3 тем.",
  topic_min_required: "Выберите хотя бы одну тему перед публикацией.",
  duplicate_topic_keys: "Каждую тему можно выбрать только один раз.",
  topic_keys_required: "Не удалось сохранить темы продукта.",
  practice_id_required: "Не удалось определить продукт.",
  practice_not_found: "Продукт не найден.",
  not_authenticated: "Требуется авторизация.",
  forbidden: "Недостаточно прав для изменения тем продукта.",
};

export function extractTopicErrorCode(message: string): TopicErrorCode | null {
  const normalized = message.toLowerCase();

  for (const code of Object.keys(TOPIC_ERROR_MESSAGES) as TopicErrorCode[]) {
    if (normalized.includes(code)) {
      return code;
    }
  }

  return null;
}

export function mapTopicRpcError(message: string): {
  status: number;
  code: TopicErrorCode | "topic_sync_failed";
  message: string;
} {
  const code = extractTopicErrorCode(message);

  if (code === "not_authenticated") {
    return { status: 401, code, message: TOPIC_ERROR_MESSAGES[code] };
  }

  if (code === "forbidden") {
    return { status: 403, code, message: TOPIC_ERROR_MESSAGES[code] };
  }

  if (
    code === "practice_not_found" ||
    code === "topic_not_found"
  ) {
    return { status: 404, code, message: TOPIC_ERROR_MESSAGES[code] };
  }

  if (code) {
    return { status: 400, code, message: TOPIC_ERROR_MESSAGES[code] };
  }

  return {
    status: 500,
    code: "topic_sync_failed",
    message: "Не удалось сохранить темы продукта.",
  };
}

export function getTopicErrorMessage(code: TopicErrorCode): string {
  return TOPIC_ERROR_MESSAGES[code];
}
