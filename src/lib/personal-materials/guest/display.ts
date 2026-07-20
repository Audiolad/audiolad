import { getPersonalMaterialTypeLabel } from "@/lib/personal-materials/client/status-labels";
import { normalizeOptionalText } from "@/lib/personal-materials/access";

export const PERSONAL_MATERIAL_GUEST_PAGE_TITLE =
  "Персональный аудиоматериал — АудиоЛад" as const;

export function getGuestDisplayTitle(
  title: string | null | undefined,
  materialType: string,
): string {
  const normalized = normalizeOptionalText(title);

  if (normalized) {
    return normalized;
  }

  return getPersonalMaterialTypeLabel(materialType);
}

export function getGuestGreeting(clientFirstName: string): string {
  const name = clientFirstName.trim();

  if (!name) {
    return "Эта аудиодиагностика подготовлена специально для вас";
  }

  return `Для вас, ${name}`;
}

export function formatGuestMaterialDate(materialDate: string): string {
  const parsed = new Date(`${materialDate}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return materialDate;
  }

  const formatted = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);

  return `Подготовлено ${formatted}`;
}
