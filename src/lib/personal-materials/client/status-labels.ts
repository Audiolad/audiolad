import { formatClientDisplayName } from "@/lib/personal-materials/display-name";
import { PERSONAL_MATERIAL_TYPES } from "@/lib/personal-materials/types";

import type { PersonalMaterialUiStatus } from "./types";
import type { AuthorPersonalMaterial } from "./types";

export const PERSONAL_MATERIAL_TYPE_OPTIONS = [
  { value: "diagnostic", label: "Диагностика" },
  { value: "audio_review", label: "Аудиоразбор" },
  { value: "personal_meditation", label: "Персональная медитация" },
  { value: "recommendation", label: "Персональная рекомендация" },
  { value: "consultation_material", label: "Материал после консультации" },
  { value: "homework", label: "Домашнее задание" },
  { value: "personal_music", label: "Персональная музыка" },
  { value: "other", label: "Другое" },
] as const satisfies ReadonlyArray<{
  value: (typeof PERSONAL_MATERIAL_TYPES)[number];
  label: string;
}>;

export function getPersonalMaterialTypeLabel(type: string): string {
  return (
    PERSONAL_MATERIAL_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    "Персональный материал"
  );
}

export function resolvePersonalMaterialUiStatus(
  material: Pick<AuthorPersonalMaterial, "status" | "claimed">,
): PersonalMaterialUiStatus {
  if (material.status === "deleted") {
    return "deleted";
  }

  if (material.status === "revoked") {
    return "revoked";
  }

  if (material.status === "draft") {
    return "draft";
  }

  if (material.status === "active" && material.claimed) {
    return "claimed";
  }

  return "active";
}

export function getPersonalMaterialStatusLabel(
  material: Pick<AuthorPersonalMaterial, "status" | "claimed">,
): string {
  switch (resolvePersonalMaterialUiStatus(material)) {
    case "draft":
      return "Черновик";
    case "active":
      return "Активна";
    case "claimed":
      return "Сохранена клиентом";
    case "revoked":
      return "Доступ отозван";
    case "deleted":
      return "Удалена";
    default:
      return "Неизвестно";
  }
}

export function getPersonalMaterialStatusClassName(
  material: Pick<AuthorPersonalMaterial, "status" | "claimed">,
): string {
  switch (resolvePersonalMaterialUiStatus(material)) {
    case "draft":
      return "bg-[#fff4df] text-[#b67a1d]";
    case "active":
      return "bg-[#eaf7ef] text-[#3d8d65]";
    case "claimed":
      return "bg-[#eef3ff] text-[#4f6db8]";
    case "revoked":
      return "bg-[#f2f2f7] text-[#6d6d80]";
    case "deleted":
      return "bg-[#f2f2f7] text-[#6d6d80]";
    default:
      return "bg-[#f2f2f7] text-[#6d6d80]";
  }
}

export function getPersonalMaterialDisplayTitle(material: {
  title: string | null;
  materialType: string;
  clientFirstName: string;
  clientLastName: string | null;
}): string {
  if (material.title?.trim()) {
    return material.title.trim();
  }

  return formatClientDisplayName(material.clientFirstName, material.clientLastName);
}

export function isPersonalMaterialDiagnostic(materialType: string): boolean {
  return materialType === "diagnostic";
}

export function getPersonalMaterialDeleteButtonLabel(materialType: string): string {
  return isPersonalMaterialDiagnostic(materialType)
    ? "Удалить диагностику"
    : "Удалить материал";
}

export function getPersonalMaterialDeleteConfirmTitle(materialType: string): string {
  return isPersonalMaterialDiagnostic(materialType)
    ? "Удалить диагностику?"
    : "Удалить материал?";
}

export function getPersonalMaterialDeleteSuccessToast(materialType: string): string {
  return isPersonalMaterialDiagnostic(materialType)
    ? "Диагностика удалена"
    : "Материал удалён";
}

export function getPersonalMaterialDeleteConfirmDescription(materialTitle: string): string {
  return `Материал „${materialTitle}“ будет удалён. Отменить это действие будет невозможно.`;
}
