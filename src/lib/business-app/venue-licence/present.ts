import {
  formatMoscowDateTime,
  resolveCustomerAccess,
  trialDaysLeft,
  type GrantRow,
} from "@/lib/access-grants/policy";

/**
 * Public licence card for one location.
 * The clock is the owner account's gift / paid / grace from resolveCustomerAccess:
 * the 30-day gift starts when that account's email is confirmed (registration),
 * not when a payment arrives. This view never carries an email, a user id or a hash.
 */

export type VenueLicenceStatus = "trial" | "paid" | "grace" | "expired" | "not_started";

/** Which stored window the status is talking about. Keeps an ended payment from being called a gift. */
export type VenueLicenceClock = "gift" | "subscription";

export type VenuePlaceFields = {
  locationName: string;
  /** Filled when registration stores a dedicated venue name (task ff4b8a16). */
  venueName?: string | null;
  /** Filled when registration stores one address string (task ff4b8a16). */
  venueAddress?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
};

export type PaidWindow = {
  start: string;
  end: string;
};

export type VenueLicenceView = {
  publicId: string;
  venueName: string;
  address: string | null;
  status: VenueLicenceStatus;
  clock: VenueLicenceClock | null;
  periodStartLabel: string | null;
  periodEndLabel: string | null;
  graceUntilLabel: string | null;
  graceDaysLeft: number | null;
};

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length ? trimmed : null;
}

export function formatVenueName(place: VenuePlaceFields): string {
  return clean(place.venueName) ?? clean(place.locationName) ?? "Точка";
}

/** Prefer the registration address string. Otherwise join the location columns. */
export function formatVenueAddress(place: VenuePlaceFields): string | null {
  const explicit = clean(place.venueAddress);
  if (explicit) return explicit;
  const parts = [place.postalCode, place.region, place.city, place.addressLine1, place.addressLine2]
    .map(clean)
    .filter((part): part is string => part !== null);
  return parts.length ? parts.join(", ") : null;
}

function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 1000;
}

function clockOf(grant: GrantRow | null, paidUntil: string | null): VenueLicenceClock | null {
  if (!grant && !paidUntil) return null;
  if (paidUntil && (!grant || Date.parse(paidUntil) >= Date.parse(grant.endsAt))) return "subscription";
  return "gift";
}

function periodOf(
  clock: VenueLicenceClock | null,
  grant: GrantRow | null,
  paidUntil: string | null,
  paidPeriod: PaidWindow | null,
): { start: string | null; end: string | null } {
  if (clock === "subscription" && paidUntil) {
    const start = paidPeriod && sameInstant(paidPeriod.end, paidUntil) ? paidPeriod.start : null;
    return { start, end: paidUntil };
  }
  if (clock === "gift" && grant) return { start: grant.startsAt, end: grant.endsAt };
  return { start: null, end: null };
}

function dayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return formatMoscowDateTime(date);
}

export function presentVenueLicence(input: {
  publicId: string;
  place: VenuePlaceFields;
  now: Date;
  grant: GrantRow | null;
  paidUntil: string | null;
  paidPeriod: PaidWindow | null;
}): VenueLicenceView {
  const confirmed = Boolean(input.grant || input.paidUntil);
  const access = resolveCustomerAccess({
    now: input.now,
    emailConfirmed: confirmed,
    grant: input.grant,
    paidUntil: input.paidUntil,
  });
  let status: VenueLicenceStatus = "not_started";
  if (access.mode === "trial") status = "trial";
  else if (access.mode === "paid") status = "paid";
  else if (access.mode === "grace") status = "grace";
  else if (access.mode === "offer" && access.endsAt) status = "expired";

  const clock = status === "not_started" ? null : clockOf(input.grant, input.paidUntil);
  const period = status === "not_started" ? { start: null, end: null } : periodOf(clock, input.grant, input.paidUntil, input.paidPeriod);
  const graceUntil = status === "grace" ? access.playbackUntil : null;

  return {
    publicId: input.publicId,
    venueName: formatVenueName(input.place),
    address: formatVenueAddress(input.place),
    status,
    clock,
    periodStartLabel: dayLabel(period.start),
    periodEndLabel: dayLabel(period.end),
    graceUntilLabel: dayLabel(graceUntil),
    graceDaysLeft: graceUntil ? trialDaysLeft(new Date(graceUntil), input.now) : null,
  };
}
