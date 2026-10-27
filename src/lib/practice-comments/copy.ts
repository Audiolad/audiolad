/** Visible Russian copy. Short dash (–) only. No medical promises. */

export const LISTENER_IMPRESSIONS_TITLE = "Впечатления";

export const LISTENER_IMPRESSION_INVITE =
  "Если хотите, поделитесь впечатлением – что вы заметили во время прослушивания.";

export const LISTENER_IMPRESSION_INVITE_ACTION = "Написать отзыв";

export const LISTENER_IMPRESSION_INVITE_DISMISS = "Не сейчас";

export const LISTENER_IMPRESSION_PRIVACY =
  "Отзыв виден на странице продукта другим слушателям и автору. Публикуется имя из поля. Его можно сократить перед публикацией. Почта не показывается. Поделитесь впечатлением от прослушивания – тем, что хотите оставить на странице. Отзыв можно изменить или удалить. Это по желанию и ни на что не влияет.";

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

export const AUTHOR_FEEDBACK_TITLE = "Отзывы слушателей";

export const AUTHOR_FEEDBACK_SUBTITLE =
  "Живые впечатления о ваших аудиопродуктах. Звёзды считаются отдельно.";

export const AUTHOR_FEEDBACK_EMPTY = "Новых отзывов пока нет.";

export const AUTHOR_FEEDBACK_REPLY_PLACEHOLDER = "Ответ слушателю";

export const AUTHOR_FEEDBACK_MARK_READ = "Прочитано";

export const ADMIN_LISTENER_COMMENTS_TITLE = "Отзывы слушателей";

export const ADMIN_LISTENER_COMMENTS_SUBTITLE =
  "Жалобы, скрытие и удаление отзывов. Это не модерация продуктов и не авторские заявки.";

export const OWNER_COMMENT_DELETE_LABEL = "Удалить";

export const OWNER_COMMENT_RETURN_LABEL = "Вернуть";

export const OWNER_COMMENT_DELETED_QUEUE = "Удалённые";

export const OWNER_DELETE_JOURNAL = "Удалён владельцем";

export const OWNER_RETURN_JOURNAL = "Возвращён";

export const OWNER_COMMENT_DELETE_CONFIRM = "Удалить отзыв?";

export const OWNER_COMMENT_RETURN_CONFIRM = "Вернуть отзыв на страницу?";

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
