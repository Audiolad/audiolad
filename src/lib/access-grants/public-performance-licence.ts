/**
 * Public performance of the permitted Business repertoire during cabinet access.
 *
 * The licence starts at registration: access_grants.starts_at, the 30-day gift.
 * Payment does not move that start. Trial, paid access and the 3-day grace are
 * the same licensed window ("пока действует доступ"). After grace the status
 * is expired. Tracks stay limited to those admitted for the venue sector;
 * this module does not widen the player gate.
 */
import type { CustomerAccessMode } from "./policy";

export const PUBLIC_PERFORMANCE_LICENCE_STATUSES = ["trial", "paid", "grace", "expired"] as const;

export type PublicPerformanceLicenceStatus = (typeof PUBLIC_PERFORMANCE_LICENCE_STATUSES)[number];

/** Player gate: business_space_admissions for the venue sector, and ELIGIBLE only. */
export const BUSINESS_LICENCE_REPERTOIRE = "business_admitted" as const;

export type PublicPerformanceLicence = {
  status: PublicPerformanceLicenceStatus;
  /** True while the cabinet access is trial, paid or grace. */
  licensed: boolean;
  /** Gift start. Never a payment timestamp. */
  startsAt: string | null;
  /** When this access stops. During grace this is the grace end. */
  endsAt: string | null;
  repertoire: typeof BUSINESS_LICENCE_REPERTOIRE;
  /** business_locations.business_category. Null until the point exists. */
  sectorLabel: string | null;
};

export function resolvePublicPerformanceLicence(input: {
  mode: CustomerAccessMode;
  startsAt?: string | null;
  endsAt?: string | null;
  playbackUntil?: string | null;
  sectorLabel?: string | null;
}): PublicPerformanceLicence | null {
  if (input.mode !== "trial" && input.mode !== "paid" && input.mode !== "grace" && input.mode !== "offer") {
    return null;
  }
  const startsAt = input.startsAt ?? null;
  const sectorLabel = input.sectorLabel?.trim() || null;
  if (input.mode === "offer") {
    return {
      status: "expired",
      licensed: false,
      startsAt,
      endsAt: input.endsAt ?? null,
      repertoire: BUSINESS_LICENCE_REPERTOIRE,
      sectorLabel,
    };
  }
  return {
    status: input.mode,
    licensed: true,
    startsAt,
    endsAt: input.mode === "grace" ? (input.playbackUntil ?? input.endsAt ?? null) : (input.endsAt ?? null),
    repertoire: BUSINESS_LICENCE_REPERTOIRE,
    sectorLabel,
  };
}
