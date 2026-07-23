import { normalizeDurationSeconds } from "@/lib/products/duration";

export function secondsToIso8601Duration(
  seconds: number | null | undefined,
): string | null {
  const normalized = normalizeDurationSeconds(seconds);

  if (normalized === null) {
    return null;
  }

  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const remainingSeconds = normalized % 60;

  let duration = "PT";

  if (hours > 0) {
    duration += `${hours}H`;
  }

  if (minutes > 0) {
    duration += `${minutes}M`;
  }

  if (remainingSeconds > 0 || (hours === 0 && minutes === 0)) {
    duration += `${remainingSeconds}S`;
  }

  return duration;
}
