"use server";

import { cookies } from "next/headers";

import { claimGuestRatingsForUser } from "@/lib/ratings/guest/claim-server";
import { GUEST_RATING_COOKIE_NAME } from "@/lib/ratings/guest/session";
import { createClient } from "@/lib/supabase/server";

export type ClaimGuestRatingsActionResult =
  | { ok: true; claimed: number; superseded: number }
  | { ok: false; error: string };

function clearGuestCookie(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set({
    name: GUEST_RATING_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * After client-side sign-in. The user id is read from the server session.
 * A failed claim does not break login; the cookie stays so the next sign-in
 * can retry. A successful claim clears the guest cookie.
 */
export async function claimGuestRatingsAction(): Promise<ClaimGuestRatingsActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return { ok: false, error: "not_authenticated" };
    }

    const cookieStore = await cookies();
    const header = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    const result = await claimGuestRatingsForUser({
      userId: user.id,
      cookieHeader: header,
    });
    if (cookieStore.get(GUEST_RATING_COOKIE_NAME)) {
      clearGuestCookie(cookieStore);
    }
    return { ok: true, claimed: result.claimed, superseded: result.superseded };
  } catch {
    return { ok: false, error: "claim_failed" };
  }
}
