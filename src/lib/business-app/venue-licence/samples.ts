import type { GrantRow } from "@/lib/access-grants/policy";

import { presentVenueLicence, type VenueLicenceView, type VenuePlaceFields } from "./present";

/**
 * Fictional cards for screenshots and unit tests. Not a venue, not a person.
 * Served only when AUDIOLAD_VENUE_LICENCE_FIXTURES=1 and NODE_ENV is not production.
 */

const NOW = new Date("2026-10-28T09:00:00.000Z");

const PLACE: VenuePlaceFields = {
  locationName: "Образец кофейни",
  city: "г. Образец",
  addressLine1: "ул. Примерная, д. 1",
};

function grant(startsAt: string, endsAt: string): GrantRow {
  return {
    emailHash: "0123456789abcdef".repeat(4),
    userId: "00000000-0000-4000-8000-000000000001",
    kind: "business_new_client",
    startsAt,
    endsAt,
  };
}

const SAMPLES: Record<string, () => VenueLicenceView> = {
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: () => presentVenueLicence({
    publicId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    place: PLACE,
    now: NOW,
    grant: grant("2026-10-01T09:00:00.000Z", "2026-10-31T09:00:00.000Z"),
    paidUntil: null,
    paidPeriod: null,
  }),
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: () => presentVenueLicence({
    publicId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    place: PLACE,
    now: NOW,
    grant: grant("2026-09-01T09:00:00.000Z", "2026-10-01T09:00:00.000Z"),
    paidUntil: "2026-11-20T09:00:00.000Z",
    paidPeriod: { start: "2026-10-21T09:00:00.000Z", end: "2026-11-20T09:00:00.000Z" },
  }),
  cccccccccccccccccccccccccccccccc: () => presentVenueLicence({
    publicId: "cccccccccccccccccccccccccccccccc",
    place: PLACE,
    now: NOW,
    grant: grant("2026-09-26T09:00:00.000Z", "2026-10-26T09:00:00.000Z"),
    paidUntil: null,
    paidPeriod: null,
  }),
  dddddddddddddddddddddddddddddddd: () => presentVenueLicence({
    publicId: "dddddddddddddddddddddddddddddddd",
    place: PLACE,
    now: NOW,
    grant: grant("2026-09-20T09:00:00.000Z", "2026-10-20T09:00:00.000Z"),
    paidUntil: null,
    paidPeriod: null,
  }),
  eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee: () => presentVenueLicence({
    publicId: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    place: { ...PLACE, locationName: "Образец без адреса", city: null, addressLine1: null },
    now: NOW,
    grant: null,
    paidUntil: null,
    paidPeriod: null,
  }),
  ffffffffffffffffffffffffffffffff: () => presentVenueLicence({
    publicId: "ffffffffffffffffffffffffffffffff",
    place: PLACE,
    now: NOW,
    grant: grant("2026-08-01T09:00:00.000Z", "2026-08-31T09:00:00.000Z"),
    paidUntil: "2026-10-20T09:00:00.000Z",
    paidPeriod: { start: "2026-09-20T09:00:00.000Z", end: "2026-10-20T09:00:00.000Z" },
  }),
};

export function sampleVenueLicence(publicId: string): VenueLicenceView | null {
  const build = SAMPLES[publicId];
  return build ? build() : null;
}

export const VENUE_LICENCE_SAMPLE_IDS = {
  trial: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  paid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  grace: "cccccccccccccccccccccccccccccccc",
  expired: "dddddddddddddddddddddddddddddddd",
  notStarted: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  expiredSubscription: "ffffffffffffffffffffffffffffffff",
} as const;
