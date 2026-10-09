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
