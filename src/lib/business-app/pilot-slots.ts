import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Venue slots are the same for every Business organization: one hall at start, the owner
 * adds the next one himself up to the system limit. The limit lives in one database row
 * (`business_venue_slot_settings.default_limit`, 10 after the self-serve migration)
 * and is read through `business_venue_slot_limit`, with no per-client setup.
 */
export const BUSINESS_VENUE_SLOT_HARD_MAX = 10;

export type BusinessVenueSlots = {
  /** How many halls this organization may have. 1 = add button hidden. */
  limit: number;
  /** More than one hall exists: per-hall selection, playback and paid periods apply. */
  multiVenue: boolean;
};

export const BUSINESS_VENUE_SLOTS_SINGLE: BusinessVenueSlots = { limit: 1, multiVenue: false };

export function normalizeBusinessVenueSlotLimit(value: unknown): number | null {
  const limit = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) return null;
  return Math.min(limit, BUSINESS_VENUE_SLOT_HARD_MAX);
}

/** Expand-only: an old schema, a failed read or a transport error keep the single-hall path. */
export async function loadBusinessVenueSlots(
  db: Pick<SupabaseClient, "from" | "rpc">,
  organizationId: string,
): Promise<BusinessVenueSlots> {
  try {
    const { data, error } = await db.rpc("business_venue_slot_limit", { p_organization_id: organizationId });
    const limit = error ? null : normalizeBusinessVenueSlotLimit(data);
    if (!limit) return BUSINESS_VENUE_SLOTS_SINGLE;
    const { count, error: countError } = await db.from("business_locations")
      .select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    if (countError) return BUSINESS_VENUE_SLOTS_SINGLE;
    return { limit, multiVenue: (count ?? 0) > 1 };
  } catch {
    return BUSINESS_VENUE_SLOTS_SINGLE;
  }
}

/** True once an organization has more than one hall. */
export async function loadBusinessPilotSlots(
  db: Pick<SupabaseClient, "from" | "rpc">,
  organizationId: string,
): Promise<boolean> {
  return (await loadBusinessVenueSlots(db, organizationId)).multiVenue;
}
