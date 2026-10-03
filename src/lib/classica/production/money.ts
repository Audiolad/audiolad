const MAX_RUBLES = 1_000_000;

export function rublesToMinor(rubles: number): number | null {
  if (!Number.isInteger(rubles) || rubles < 0 || rubles > MAX_RUBLES) {
    return null;
  }
  return rubles * 100;
}

export function parseRublesInput(value: string | null | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return rublesToMinor(Number(trimmed));
}

export function formatRubMinor(minor: number | null | undefined): string {
  if (typeof minor !== "number" || !Number.isFinite(minor)) {
    return "0 ₽";
  }
  const rubles = minor / 100;
  if (Number.isInteger(rubles)) {
    return `${new Intl.NumberFormat("ru-RU").format(rubles)} ₽`;
  }
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rubles)} ₽`;
}
