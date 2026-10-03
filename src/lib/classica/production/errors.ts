import { CLASSICA_CHECKLIST_LABELS, type ClassicaChecklistId } from "@/lib/classica/production/checklist";

const MESSAGES: Record<string, string> = {
  classica_auth_required: "Нужно войти в аккаунт.",
  classica_forbidden: "Недостаточно прав для этого действия.",
  classica_job_not_found: "Работа не найдена.",
  classica_already_reserved: "Эту работу уже взял другой оператор.",
  classica_status_locked: "Сейчас это действие недоступно для текущего статуса.",
  classica_checklist_failed: "Сдать на проверку можно только после полного чеклиста.",
  classica_assignee_not_operator: "Назначить можно только оператора или администратора Classica.",
  classica_slug_taken: "Такой адрес страницы уже занят.",
  classica_invalid_slug: "Slug: строчные латинские буквы, цифры и дефисы.",
  classica_invalid_composer_slug: "Slug композитора: строчные латинские буквы, цифры и дефисы.",
  classica_return_reason_required: "Чтобы вернуть на доработку, укажите причину.",
  classica_comment_required: "Комментарий не может быть пустым.",
  classica_user_not_found: "Пользователь с таким email не найден.",
  classica_user_ambiguous: "Найдено несколько пользователей с этим email.",
  classica_prompt_invalid: "Промпт должен быть от 200 до 20000 символов.",
  classica_invalid_field: "Проверьте поля карточки.",
  classica_asset_invalid: "Файл не принят.",
  classica_playback_required: "Сначала загрузите итоговое аудио и дождитесь его длительности.",
  classica_publish_incomplete: "Публикация остановлена: не хватает публичных файлов.",
};

function isChecklistId(value: string): value is ClassicaChecklistId {
  return value in CLASSICA_CHECKLIST_LABELS;
}

export function mapClassicaError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : error instanceof Error
        ? error.message
        : String(error ?? "");

  if (message.includes("classica_checklist_failed")) {
    const codes = message.split(":").slice(1).join(":").split(/[,\s]+/).filter(Boolean);
    const labels = codes.filter(isChecklistId).map((code) => CLASSICA_CHECKLIST_LABELS[code]);
    if (labels.length > 0) {
      return `Чеклист не пройден: ${labels.join("; ")}.`;
    }
    return MESSAGES.classica_checklist_failed;
  }

  for (const [code, label] of Object.entries(MESSAGES)) {
    if (message.includes(code)) {
      return label;
    }
  }

  return "Не удалось выполнить действие. Повторите попытку.";
}
