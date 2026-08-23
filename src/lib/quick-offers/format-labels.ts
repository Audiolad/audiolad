import {
  clipVisibleCharacters,
  QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH,
} from "@/lib/quick-offers/validation";

export function formatMaterialNumber(sortOrder: number): string {
  const index = Math.max(1, Math.floor(sortOrder) + 1);
  return String(index).padStart(2, "0");
}

export function formatMaterialCaption(
  sortOrder: number,
  formatLabel: string,
): string {
  const label = formatLabel.replace(/[\r\n\u2028\u2029]/g, "").trim();
  const clipped = clipVisibleCharacters(
    label,
    QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH,
  );
  return `${formatMaterialNumber(sortOrder)} · ${clipped}`;
}
