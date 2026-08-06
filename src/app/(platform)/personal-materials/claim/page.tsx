import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import {
  verifySignedClaimContext,
} from "@/lib/personal-materials/claim-context";
import { PERSONAL_MATERIAL_CLAIM_COOKIE } from "@/lib/personal-materials/types";
import { claimPersonalMaterialByMaterialId } from "@/lib/personal-materials/server/claim";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PersonalMaterialClaimCompletionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildAuthRouteHref("/auth/sign-in", "/personal-materials/claim"));
  }

  const cookieStore = await cookies();
  const claimCookie = cookieStore.get(PERSONAL_MATERIAL_CLAIM_COOKIE)?.value;

  if (!claimCookie) {
    redirect("/my-practices");
  }

  let materialId: string;

  try {
    const payload = verifySignedClaimContext(claimCookie);
    materialId = payload.materialId;
  } catch {
    redirect("/my-practices");
  }

  try {
    const result = await claimPersonalMaterialByMaterialId(supabase, materialId);
    cookieStore.set(PERSONAL_MATERIAL_CLAIM_COOKIE, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
    redirect(`/my-materials/${encodeURIComponent(result.materialId)}`);
  } catch {
    redirect("/my-practices");
  }
}
