/** Format kopecks as ru-RU rubles without float math on the major unit. */
export function formatRubFromMinor(amountMinor: number | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined || !Number.isFinite(amountMinor)) {
    return "—";
  }

  const sign = amountMinor < 0 ? "−" : "";
  const abs = Math.abs(Math.trunc(amountMinor));
  const rubles = Math.trunc(abs / 100);
  const kopecks = abs % 100;
  const grouped = rubles.toLocaleString("ru-RU");

  if (kopecks === 0) {
    return `${sign}${grouped} ₽`;
  }

  return `${sign}${grouped},${String(kopecks).padStart(2, "0")} ₽`;
}

export function formatCountOrDash(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return Math.trunc(value).toLocaleString("ru-RU");
}
