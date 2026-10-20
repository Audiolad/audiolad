/** Client-safe: no registry imports, so client components can use it. */
export function formatArticleReadingTimeLabel(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes)
    ? Math.max(1, Math.round(minutes))
    : 1;
  const mod10 = safeMinutes % 10;
  const mod100 = safeMinutes % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${safeMinutes} минута чтения`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${safeMinutes} минуты чтения`;
  }

  return `${safeMinutes} минут чтения`;
}
