import type { RecipientPlanSummary } from "./recipients";

export function formatRecipientSummary(
  item: RecipientPlanSummary,
  messageType: "author_operational" | "author_marketing",
): string {
  const parts = [
    `Найдено ${item.found}.`,
    `Исключено стоп-листом ${item.suppressed}.`,
    `Исключено согласия ${item.consentExcluded}.`,
    `Некорректный email ${item.invalidOrNoEmail}.`,
    `Дубли адресов ${item.duplicateEmails ?? 0}.`,
    `Прочие исключения ${item.excludedOther}.`,
    `К отправке ${item.ready}.`,
  ];
  if (messageType === "author_marketing" && item.consentExcluded > 0) {
    parts.push(`Нет согласия на рекламу у ${item.consentExcluded} получателей.`);
  }
  return parts.join(" ");
}

export const DUPLICATE_HELP_TEXT = "один адрес получит письмо один раз";
