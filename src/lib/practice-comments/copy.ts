/** Visible Russian copy. Short dash (–) only. No medical promises. */

export const LISTENER_IMPRESSIONS_TITLE = "Впечатления";

export const LISTENER_IMPRESSION_INVITE =
  "Если хотите, поделитесь впечатлением – что вы заметили во время прослушивания.";

export const LISTENER_IMPRESSION_INVITE_ACTION = "Написать отзыв";

export const LISTENER_IMPRESSION_INVITE_DISMISS = "Не сейчас";

export const LISTENER_IMPRESSION_EMPTY =
  "Пока нет отзывов. Если захотите, можно поделиться впечатлением.";

export const LISTENER_IMPRESSION_SIGN_IN =
  "Войдите, чтобы оставить отзыв. Гостевые отзывы не публикуются.";

export const LISTENER_IMPRESSION_SUBMIT = "Опубликовать отзыв";

export const LISTENER_IMPRESSION_SAVING = "Публикуем…";

export const LISTENER_IMPRESSION_PLACEHOLDER =
  "Что вы почувствовали, заметили, ощутили, когда слушали";

export const LISTENER_IMPRESSION_EMOJI_LABEL = "Добавить в отзыв";

export const LISTENER_IMPRESSION_EMOJIS = [
  { emoji: "❤️", label: "Сердце" },
  { emoji: "🔥", label: "Огонь" },
  { emoji: "🙏", label: "Благодарю" },
  { emoji: "😇", label: "Ангел" },
  { emoji: "🕊️", label: "Голубь" },
] as const;

export const LISTENER_IMPRESSION_NAME_LABEL = "Имя в отзыве";

export const LISTENER_IMPRESSION_EDIT = "Изменить";

export const LISTENER_IMPRESSION_DELETE = "Удалить";

export const LISTENER_IMPRESSION_SAVE = "Сохранить";

export const LISTENER_IMPRESSION_CANCEL = "Отмена";

export const LISTENER_IMPRESSION_REPORT = "Пожаловаться";

export const LISTENER_IMPRESSION_AUTHOR_REPLY_LABEL = "Ответ автора";

export const LISTENER_IMPRESSION_REPLY_ACTION = "Ответить";

export const LISTENER_IMPRESSION_SORT_NEW = "Сначала новые";

export const LISTENER_IMPRESSION_SORT_OLD = "Сначала старые";

export const LISTENER_IMPRESSION_LOAD_MORE = "Показать ещё";

export const LISTENER_IMPRESSION_RETRY = "Повторить";

export const LISTENER_IMPRESSION_ERROR =
  "Не удалось загрузить отзывы. Прослушивание от этого не зависит.";

export const LISTENER_IMPRESSION_HIDDEN =
  "Отзыв скрыт модератором и не виден другим.";

export const LISTENER_COMMENT_DEFAULT_PUBLIC_NAME = "Слушатель";

export const LISTENER_COMMENT_AUTHOR_PUBLIC_NAME = "Автор";

export const AUTHOR_COMMENTS_HREF = "/author-dashboard/feedback";

export const AUTHOR_COMMENTS_TITLE = "Комментарии";

export const AUTHOR_COMMENTS_SUBTITLE =
  "Все комментарии слушателей к вашим продуктам. Новые подсвечены, прочитанные остаются в истории. Звёзды считаются отдельно.";

export const AUTHOR_COMMENTS_EMPTY = "Пока нет комментариев.";

export const AUTHOR_COMMENTS_FILTER_ALL = "Все";

export const AUTHOR_COMMENTS_FILTER_NEW = "Новые";

export const AUTHOR_COMMENTS_FILTER_UNANSWERED = "Без ответа";

export const AUTHOR_COMMENTS_MARK_ALL = "Отметить все прочитанными";

export const AUTHOR_COMMENTS_OPEN = "Открыть на странице";

export const AUTHOR_COMMENTS_NEW_LABEL = "Новый";

export const AUTHOR_COMMENTS_BADGE_LABEL = "Новые комментарии";

export const AUTHOR_COMMENTS_ALL_PROJECTS = "Все проекты";

export const AUTHOR_FEEDBACK_TITLE = "Отзывы слушателей";

export const AUTHOR_FEEDBACK_SUBTITLE =
  "Живые впечатления о ваших аудиопродуктах. Звёзды считаются отдельно.";

export const AUTHOR_FEEDBACK_EMPTY = "Новых отзывов пока нет.";

export const AUTHOR_FEEDBACK_REPLY_PLACEHOLDER = "Ответ слушателю";

export const AUTHOR_FEEDBACK_MARK_READ = "Прочитано";

export const ADMIN_LISTENER_COMMENTS_TITLE = "Отзывы слушателей";

export const ADMIN_LISTENER_COMMENTS_SUBTITLE =
  "Отзывы слушателей на всех опубликованных продуктах: жалобы, скрытие и удаление. Здесь же – звёздные оценки продуктов, авторов и слушателей. Это не модерация продуктов и не авторские заявки.";

export const OWNER_COMMENT_DELETE_LABEL = "Удалить";

export const OWNER_COMMENT_RETURN_LABEL = "Вернуть";

export const OWNER_COMMENT_DELETED_QUEUE = "Удалённые";

export const OWNER_DELETE_JOURNAL = "Удалён владельцем";

export const OWNER_RETURN_JOURNAL = "Возвращён";

export const OWNER_COMMENT_DELETE_CONFIRM = "Удалить отзыв?";

export const OWNER_COMMENT_RETURN_CONFIRM = "Вернуть отзыв на страницу?";

export const OWNER_COMMENT_RETURN_HIDDEN_CONFIRM =
  "Вернуть отзыв в скрытые? На странице его не будет.";

export const OWNER_DELETE_PREVIOUS_PUBLISHED = "Был опубликован";

export const OWNER_DELETE_PREVIOUS_HIDDEN = "Был скрыт";

export const OWNER_RETURN_STATUS_PUBLISHED = "Снова на странице";

export const OWNER_RETURN_STATUS_HIDDEN = "Снова скрыт";

export const MODERATION_ACTOR_FALLBACK = "Участник";

const ACTOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readableActorToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !ACTOR_UUID.test(trimmed) && !/token=/i.test(trimmed);
}

/** Name, otherwise the mailbox handle. Never a user id or a signed token. */
export function moderationActorLabel(input: {
  fullName?: string | null;
  email?: string | null;
}): string {
  const name = input.fullName?.trim() ?? "";
  if (readableActorToken(name)) return name;
  const email = input.email?.trim() ?? "";
  if (/token=/i.test(email)) return MODERATION_ACTOR_FALLBACK;
  const handle = email.split("@")[0]?.trim() ?? "";
  if (readableActorToken(handle)) return handle;
  return MODERATION_ACTOR_FALLBACK;
}

export function moderationJournalActionLabel(action: string): string {
  if (action === "owner_delete") return OWNER_DELETE_JOURNAL;
  if (action === "owner_return") return OWNER_RETURN_JOURNAL;
  if (action === "hide") return MODERATION_ACTION_LABELS.hide;
  if (action === "report") return MODERATION_ACTION_LABELS.report;
  return "Запись в журнале";
}

export function moderationJournalReasonLabel(reason: string | null): string {
  if (!reason) return "без причины";
  if (reason === "previous:published") return OWNER_DELETE_PREVIOUS_PUBLISHED;
  if (reason === "previous:hidden") return OWNER_DELETE_PREVIOUS_HIDDEN;
  if (reason === "status:published") return OWNER_RETURN_STATUS_PUBLISHED;
  if (reason === "status:hidden") return OWNER_RETURN_STATUS_HIDDEN;
  if (reason in REPORT_REASON_LABELS) {
    return REPORT_REASON_LABELS[reason as keyof typeof REPORT_REASON_LABELS];
  }
  if (reason in MODERATION_ACTION_LABELS) {
    return MODERATION_ACTION_LABELS[reason as keyof typeof MODERATION_ACTION_LABELS];
  }
  return "запись в журнале";
}

export function ownerReturnConfirm(previous: "published" | "hidden"): string {
  return previous === "hidden"
    ? OWNER_COMMENT_RETURN_HIDDEN_CONFIRM
    : OWNER_COMMENT_RETURN_CONFIRM;
}

export const REPORT_REASON_LABELS = {
  spam: "Спам",
  insult: "Оскорбление",
  personal_data: "Личные данные",
  other: "Другое",
} as const;

export const MODERATION_ACTION_LABELS = {
  hide: "Скрыт",
  report: "Жалоба",
} as const;
