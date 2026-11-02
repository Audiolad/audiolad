import { redirect } from "next/navigation";

import { businessReturnPath, businessReturnTarget, BUSINESS_CABINET_RETURN_PATH } from "@/lib/access-grants/paths";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lands here after sign-in from a business payment. Opens the cabinet, does not issue a gift. */
export default async function BusinessCabinetPaymentReturnPage({ searchParams }: {
  searchParams: Promise<{ site?: string | string[] }>;
}) {
  const { site: requestedSite } = await searchParams;
  const site = typeof requestedSite === "string" ? requestedSite : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildAuthRouteHref("/auth/sign-in", businessReturnPath(BUSINESS_CABINET_RETURN_PATH, site)));
  }

  redirect(businessReturnTarget({ site, cabinet: true }));
}
