export type AdminProductModerationFilterKey =
  | "submitted"
  | "changes_requested"
  | "published"
  | "unpublished";

export type AdminProductModerationFilterOption = {
  filterKey: AdminProductModerationFilterKey;
  label: string;
};

export const ADMIN_PRODUCT_MODERATION_FILTER_OPTIONS: readonly AdminProductModerationFilterOption[] =
  [
    { filterKey: "submitted", label: "На модерации" },
    { filterKey: "changes_requested", label: "Требуются изменения" },
    { filterKey: "published", label: "Опубликованные" },
    { filterKey: "unpublished", label: "Снятые с публикации" },
  ] as const;

export function resolveAdminProductModerationFilter(
  raw: string | null | undefined,
): AdminProductModerationFilterKey {
  const value = (raw ?? "submitted").trim();

  if (
    value === "changes_requested" ||
    value === "published" ||
    value === "unpublished" ||
    value === "submitted"
  ) {
    return value;
  }

  return "submitted";
}

export function getAdminProductModerationFilterLabel(
  filterKey: AdminProductModerationFilterKey,
): string {
  return (
    ADMIN_PRODUCT_MODERATION_FILTER_OPTIONS.find(
      (option) => option.filterKey === filterKey,
    )?.label ?? "На модерации"
  );
}
