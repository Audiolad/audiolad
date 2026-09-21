"use server";

import { cookies } from "next/headers";

import { claimPartnerAttribution } from "@/lib/author-partner/attribution";
import { AUTHOR_PARTNER_ATTRIBUTION_COOKIE } from "@/lib/author-partner/constants";
import { createClient } from "@/lib/supabase/server";

export type ClaimPartnerAttributionActionResult =
  | { ok: true; result: string }
  | { ok: false; error: string };

/**
 * After client-side signInWithPassword, claim pending httpOnly attribution.
 * Auth user is resolved on the server — never trust a client-supplied user id.
 * Failures must not break login.
 */
export async function claimPartnerAttributionAction(): Promise<ClaimPartnerAttributionActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return { ok: false, error: "not_authenticated" };
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)?.value;

    const result = await claimPartnerAttribution({
      token,
      inviteeUserId: user.id,
      source: "signin",
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true, result: result.result };
  } catch {
    return { ok: false, error: "claim_failed" };
  }
}
