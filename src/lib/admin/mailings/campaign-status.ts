export const CAMPAIGN_STATUSES = [
  "draft",
  "queued",
  "sending",
  "sent",
  "partially_failed",
  "failed",
  "cancelled",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const RECIPIENT_STATUSES = [
  "queued",
  "sent",
  "failed",
  "suppressed",
  "excluded",
  "cancelled",
] as const;

export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export type CampaignRollup = {
  recipientTotal: number;
  recipientQueued: number;
  recipientSent: number;
  recipientFailed: number;
  recipientSuppressed: number;
  recipientExcluded: number;
  phase: "queued" | "sending" | "sent" | "partially_failed" | "failed";
};

export function deriveCampaignRollup(statuses: readonly RecipientStatus[]): CampaignRollup {
  let queued = 0;
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let excluded = 0;

  for (const status of statuses) {
    if (status === "queued") queued += 1;
    else if (status === "sent") sent += 1;
    else if (status === "failed") failed += 1;
    else if (status === "suppressed") suppressed += 1;
    else excluded += 1;
  }

  let phase: CampaignRollup["phase"];
  if (queued > 0) {
    phase = sent > 0 || failed > 0 ? "sending" : "queued";
  } else if (failed > 0 && sent > 0) {
    phase = "partially_failed";
  } else if (failed > 0) {
    phase = "failed";
  } else {
    phase = "sent";
  }

  return {
    recipientTotal: statuses.length,
    recipientQueued: queued,
    recipientSent: sent,
    recipientFailed: failed,
    recipientSuppressed: suppressed,
    recipientExcluded: excluded,
    phase,
  };
}

export function campaignStatusLabel(status: CampaignStatus): string {
  switch (status) {
    case "draft":
      return "Черновик";
    case "queued":
      return "В очереди";
    case "sending":
      return "Отправляется";
    case "sent":
      return "Отправлена";
    case "partially_failed":
      return "Частично с ошибками";
    case "failed":
      return "Ошибка";
    case "cancelled":
      return "Отменена";
    default:
      return status;
  }
}

export function messageTypeLabel(messageType: string): string {
  if (messageType === "author_marketing") {
    return "Информационное / продвижение";
  }

  if (messageType === "author_operational") {
    return "Служебное";
  }

  return messageType;
}

export function audienceLabel(audienceType: string): string {
  if (audienceType === "authors") {
    return "Авторы";
  }

  if (audienceType === "listeners") {
    return "Слушатели";
  }

  return audienceType;
}

/** Display-only Russian labels; DB/API values stay unchanged. */
export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  queued: "В очереди",
  sent: "Отправлено",
  failed: "Ошибка",
  suppressed: "В стоп-листе",
  excluded: "Исключен",
  cancelled: "Отменено",
};

export function recipientStatusLabel(status: string): string {
  return (RECIPIENT_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export const RECIPIENT_REASON_LABELS: Record<string, string> = {
  duplicate: "Дубль адреса",
  fixture: "Тестовая запись",
  invalid_email: "Некорректный email",
  consent: "Нет согласия",
  author_marketing_consent: "Нет согласия на рекламу",
  author_marketing_preference: "Реклама отключена в настройках",
  author_operational: "Служебные письма отключены",
  suppressed: "В стоп-листе",
  all: "Стоп-лист: все письма",
  all_non_critical: "Стоп-лист: все, кроме критичных",
  author_marketing: "Стоп-лист: реклама авторам",
  marketing: "Стоп-лист: реклама",
};

export function recipientReasonLabel(reason: string): string {
  return RECIPIENT_REASON_LABELS[reason] ?? reason;
}

/** Russian labels for every error/reason code the mailing flow can return or store. */
export const MAILING_CODE_LABELS: Record<string, string> = {
  // validation
  subject_required: "Укажите тему письма",
  subject_invalid: "Некорректная тема письма",
  heading_required: "Укажите заголовок",
  paragraphs_required: "Добавьте текст письма",
  url_invalid: "Некорректная ссылка",
  cta_incomplete: "Кнопка заполнена не полностью",
  link_incomplete: "Ссылка заполнена не полностью",
  audience_not_supported: "Аудитория не поддерживается",
  sender_not_supported: "Отправитель не поддерживается",
  filter_invalid: "Некорректный фильтр получателей",
  message_type_invalid: "Некорректный тип письма",
  content_too_long: "Слишком длинный текст письма",
  too_many_recipients: "Слишком много получателей",
  // launch / service
  invalid_campaign: "Рассылка заполнена некорректно",
  invalid_input: "Некорректные данные",
  invalid_payload: "Некорректное содержимое письма",
  invalid_outbox_row: "Некорректная запись очереди",
  no_eligible_recipients: "Нет получателей к отправке",
  not_found: "Не найдено",
  not_draft: "Рассылка уже не черновик",
  already_launched: "Рассылка уже запущена",
  not_cancellable: "Рассылку нельзя отменить",
  unsubscribe_not_configured: "Не настроена ссылка отписки",
  delivery_persist_failed: "Не удалось сохранить результат отправки",
  // transport
  sender_not_enabled: "Отправитель не включён",
  authors_smtp_not_configured: "Почта для авторов не настроена",
  smtp_not_configured: "Почта не настроена",
  smtp_send_failed: "Ошибка отправки по SMTP",
  send_failed: "Не удалось отправить письмо",
  template_render_failed: "Не удалось собрать письмо",
  recipient_missing: "Не указан получатель",
  test_recipient_not_allowed: "Этот адрес нельзя использовать для теста",
  // gate / planner reasons
  preference: "Отключено в настройках получателя",
  consent_required: "Нужно согласие получателя",
  cancelled: "Отменено",
  expired: "Срок действия истёк",
  invalid: "Некорректно",
  not_configured: "Не настроено",
};

export const MAILING_FILTER_LABELS: Record<string, string> = {
  all_authors: "Все авторы",
  specific_authors: "Выбранные авторы",
  published_products: "Авторы с опубликованными продуктами",
  no_published_products: "Авторы без опубликованных продуктов",
  commercial_authors: "Коммерческие авторы",
};

export function filterKindLabel(kind: string): string {
  return MAILING_FILTER_LABELS[kind] ?? "Свой фильтр";
}

/** Russian text for any code; unknown codes get a generic Russian message plus the code in brackets. */
export function mailingCodeLabel(code: string): string {
  return (
    MAILING_CODE_LABELS[code] ??
    RECIPIENT_REASON_LABELS[code] ??
    `Не удалось выполнить действие (код: ${code})`
  );
}

/** Russian label for a stored recipient error. `detail` is the raw text for a muted secondary line. */
export function recipientErrorLabel(raw: string): { label: string; detail: string | null } {
  const known = MAILING_CODE_LABELS[raw] ?? RECIPIENT_REASON_LABELS[raw];
  if (known) return { label: known, detail: null };
  return { label: "Ошибка отправки", detail: raw };
}
