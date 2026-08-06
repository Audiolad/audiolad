import { notFound, redirect } from "next/navigation";

import PersonalMaterialClaimedLanding from "@/components/personal-materials/guest/PersonalMaterialClaimedLanding";
import PersonalMaterialGuestPage from "@/components/personal-materials/guest/PersonalMaterialGuestPage";
import { canOwnerAccessMaterial } from "@/lib/personal-materials/access";
import { buildPersonalMaterialGuestApiPaths } from "@/lib/personal-materials/guest/api-paths";
import { buildPersonalMaterialGuestMetadata } from "@/lib/personal-materials/guest/privacy";
import {
  findGuestMaterialByRawToken,
  isGuestMaterialAvailable,
  loadGuestAuthor,
} from "@/lib/personal-materials/server/delivery";
import { toSafeGuestPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata() {
  return buildPersonalMaterialGuestMetadata();
}

export default async function PersonalMaterialGuestRoutePage({ params }: PageProps) {
  const { token } = await params;
  const apiPaths = buildPersonalMaterialGuestApiPaths(token);

  if (!apiPaths) {
    notFound();
  }

  const material = await findGuestMaterialByRawToken(token);

  if (!material) {
    notFound();
  }

  // Claimed landing uses retained token hash only as a safe entry point.
  // Content/audio stay closed (guest APIs still require available guest access).
  if (material.claimed_by_user_id && material.status !== "deleted") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && canOwnerAccessMaterial(material, user.id)) {
      redirect(`/my-materials/${encodeURIComponent(material.id)}`);
    }

    if (user) {
      return (
        <PersonalMaterialClaimedLanding mode="wrong_account" />
      );
    }

    return <PersonalMaterialClaimedLanding mode="login" />;
  }

  if (!isGuestMaterialAvailable(material)) {
    notFound();
  }

  const author = await loadGuestAuthor(material.author_id);

  if (!author?.id || !author.name || !author.slug) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const guestMaterial = toSafeGuestPersonalMaterialDto({ material, author });

  return (
    <PersonalMaterialGuestPage
      material={guestMaterial}
      apiPaths={apiPaths}
      isAuthenticated={Boolean(user)}
      claimCompletePath="/personal-materials/claim"
    />
  );
}
