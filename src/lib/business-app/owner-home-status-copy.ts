import { deriveOwnerConnectivitySignal, type BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";

/**
 * Honest Owner Home copy (c02fe282 P0-1). Only states what the signals prove:
 * heartbeat freshness and the last registered playback event. Unknown → neutral.
 */
export function formatBusinessAge(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 0.5) return "только что";
  if (minutes < 1) return "меньше минуты назад";
  if (minutes < 60) return `${Math.round(minutes)} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

export type BusinessHomeStatusCopy = ReturnType<typeof deriveOwnerConnectivitySignal>;

export function buildBusinessHomeStatusCopy(
  signals: BusinessOwnerHomeSignals | null,
  isClosedNow?: boolean,
): BusinessHomeStatusCopy {
  return deriveOwnerConnectivitySignal({ ...signals, isClosedNow });
}
