import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  BUSINESS_VENUE_FALLBACK_PATH,
  businessCabinetCan,
  businessOwnerUnlockUntil,
  resolveBusinessCabinetMode,
  type BusinessCabinetMode,
  type BusinessCabinetPermission,
} from "@/lib/business-app/cabinet-mode";
import { BUSINESS_VIEW_COOKIE, parseBusinessEntry } from "@/lib/business-app/live-refresh";
import { businessPointSessionAlive } from "@/lib/business-app/point-session.server";
import { createClient } from "@/lib/supabase/server";

/** Verified JWT claims of this request (null when signed out). One read per request. */
const loadBusinessClaims = cache(async (): Promise<Record<string, unknown> | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;
    return data.claims as Record<string, unknown>;
  } catch {
    return null;
  }
});

/** Fresh password entry on this browser: the end of the owner unlock in unix seconds, or null. */
export async function loadBusinessOwnerUnlockUntil(): Promise<number | null> {
  return businessOwnerUnlockUntil(await loadBusinessClaims(), Math.floor(Date.now() / 1000));
}

export type BusinessCabinetModeState = {
  mode: BusinessCabinetMode;
  pointAlive: boolean;
  /** Unix seconds; set only on the hall device while the owner unlock lasts. */
  ownerUnlockUntil: number | null;
};

/**
 * The mode of this request (one read per request). Only a signed-in person can preview; the
 * preview choice is a UI cookie and only ever narrows what the cabinet shows.
 */
export const loadBusinessCabinetMode = cache(async (): Promise<BusinessCabinetModeState> => {
  const pointAlive = await businessPointSessionAlive();
  const ownerUnlockUntil = pointAlive ? await loadBusinessOwnerUnlockUntil() : null;
  const previewChosen = !pointAlive && parseBusinessEntry((await cookies()).get(BUSINESS_VIEW_COOKIE)?.value) === "venue";
  const canPreview = previewChosen && typeof (await loadBusinessClaims())?.sub === "string";
  const mode = resolveBusinessCabinetMode({ pointAlive, ownerUnlocked: ownerUnlockUntil !== null, previewChosen, canPreview });
  return { mode, pointAlive, ownerUnlockUntil };
});

/**
 * Server guard for owner actions and routes: true when this browser is the hall device and the
 * owner has not re-entered the password. Preview is a UI choice on the owner's own browser and
 * does not block the owner's own requests.
 */
export async function businessHallDeviceLocked(): Promise<boolean> {
  return (await loadBusinessCabinetMode()).mode === "point";
}

/** Page guard: a venue-side visitor (point or preview) without this permission opens «Музыка». */
export async function requireBusinessCabinetPermission(
  permission: BusinessCabinetPermission,
  options: { pointCanEdit?: boolean } = {},
): Promise<BusinessCabinetModeState> {
  const state = await loadBusinessCabinetMode();
  if (!businessCabinetCan({ mode: state.mode, pointCanEdit: options.pointCanEdit }, permission)) {
    redirect(BUSINESS_VENUE_FALLBACK_PATH);
  }
  return state;
}

/** The signed-in account's email from verified claims (prefills the owner password check). */
export async function loadBusinessCabinetEmail(): Promise<string> {
  const email = (await loadBusinessClaims())?.email;
  return typeof email === "string" ? email : "";
}
