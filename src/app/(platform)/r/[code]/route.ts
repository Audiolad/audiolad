import { cookies } from "next/headers";

import { handlePartnerInviteRequest } from "@/lib/author-partner/invite-route";
import { AUTHOR_PARTNER_ATTRIBUTION_COOKIE } from "@/lib/author-partner/constants";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)?.value;

  let inviteeUserId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    inviteeUserId = user?.id ?? null;
  } catch {
    inviteeUserId = null;
  }

  return handlePartnerInviteRequest({
    request,
    rawCode,
    landing: "home",
    existingToken,
    inviteeUserId,
  });
}
