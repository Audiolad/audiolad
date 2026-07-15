import { getDisplayFormat } from "@/lib/author-products/format";

export function normalizeDurationSeconds(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

export function sumDurationSeconds(
  items: ReadonlyArray<{ durationSeconds: number | null | undefined }>,
): number {
  return items.reduce(
    (total, item) => total + (normalizeDurationSeconds(item.durationSeconds) ?? 0),
    0,
  );
}

/** Track duration: 08:42 or 1:12:35 */
export function formatAudioDuration(
  seconds: number | null | undefined,
): string | null {
  const normalized = normalizeDurationSeconds(seconds);

  if (normalized === null) {
    return null;
  }

  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const secs = normalized % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Product total duration: 8 мин, 29 мин, 1 ч 5 мин */
export function formatProductDuration(
  totalSeconds: number | null | undefined,
  fallbackMinutes?: number | null,
): string | null {
  const normalized = normalizeDurationSeconds(totalSeconds);

  let totalMinutes: number | null = null;

  if (normalized !== null) {
    totalMinutes = Math.ceil(normalized / 60);
  } else if (
    typeof fallbackMinutes === "number" &&
    Number.isFinite(fallbackMinutes) &&
    fallbackMinutes > 0
  ) {
    totalMinutes = Math.ceil(fallbackMinutes);
  }

  if (totalMinutes === null) {
    return null;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours} ч ${minutes} мин`;
    }

    return `${hours} ч`;
  }

  return `${totalMinutes} мин`;
}

export function formatAudioCountLabel(count: number): string {
  return `${count} аудио`;
}

export function isMultiAudioProduct(audioCount: number): boolean {
  return audioCount >= 2;
}

type FormatProductMetaInput = {
  format?: string | null;
  audioCount: number;
  totalDurationSeconds?: number | null;
  durationMinutesFallback?: number | null;
};

/** Catalog card stats under cover: 7 аудио · 29 мин or 12 мин (no format prefix). */
export function formatCatalogProductStats(
  input: FormatProductMetaInput,
): string | null {
  const duration = formatProductDuration(
    input.totalDurationSeconds,
    input.durationMinutesFallback,
  );

  if (isMultiAudioProduct(input.audioCount)) {
    const parts = [formatAudioCountLabel(input.audioCount)];

    if (duration) {
      parts.push(duration);
    }

    return parts.join(" · ");
  }

  return duration;
}

/** Catalog and practice meta: format · 3 аудио · 29 мин or format · 12 мин */
export function formatProductMeta(input: FormatProductMetaInput): string | null {
  const trimmedFormat = getDisplayFormat(input.format) ?? "";
  const duration = formatProductDuration(
    input.totalDurationSeconds,
    input.durationMinutesFallback,
  );

  let productPart: string | null = null;

  if (isMultiAudioProduct(input.audioCount)) {
    const parts = [formatAudioCountLabel(input.audioCount)];

    if (duration) {
      parts.push(duration);
    }

    productPart = parts.join(" · ");
  } else if (duration) {
    productPart = duration;
  }

  if (trimmedFormat && productPart) {
    return `${trimmedFormat} · ${productPart}`;
  }

  if (trimmedFormat) {
    return trimmedFormat;
  }

  return productPart;
}
