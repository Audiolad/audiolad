export const PERSONAL_MATERIAL_TEMPLATE_DISPLAY_ORDER = [
  "Диагностика МАКС",
  "Диагностика Телеграм",
  "Диагностика ПДФ МАКС",
  "Диагностика ПДФ Телеграм",
] as const;

const DISPLAY_RANK = new Map<string, number>(
  PERSONAL_MATERIAL_TEMPLATE_DISPLAY_ORDER.map((title, index) => [title, index]),
);

export type PersonalMaterialTemplateDisplaySortable = {
  id: string;
  internalName?: string;
  internal_name?: string;
};

function getInternalName(item: PersonalMaterialTemplateDisplaySortable): string {
  return item.internalName ?? item.internal_name ?? "";
}

export function comparePersonalMaterialTemplateDisplayOrder(
  left: PersonalMaterialTemplateDisplaySortable,
  right: PersonalMaterialTemplateDisplaySortable,
): number {
  const leftName = getInternalName(left);
  const rightName = getInternalName(right);
  const leftRank = DISPLAY_RANK.get(leftName);
  const rightRank = DISPLAY_RANK.get(rightName);
  const leftKnown = leftRank !== undefined;
  const rightKnown = rightRank !== undefined;

  if (leftKnown && rightKnown) {
    return leftRank - rightRank || left.id.localeCompare(right.id);
  }

  if (leftKnown) {
    return -1;
  }

  if (rightKnown) {
    return 1;
  }

  return (
    leftName.localeCompare(rightName, "ru") || left.id.localeCompare(right.id)
  );
}

export function sortPersonalMaterialTemplatesForDisplay<
  T extends PersonalMaterialTemplateDisplaySortable,
>(templates: readonly T[]): T[] {
  return [...templates].sort(comparePersonalMaterialTemplateDisplayOrder);
}
