import { notFound } from "next/navigation";

import PersonalMaterialGuestPage from "@/components/personal-materials/guest/PersonalMaterialGuestPage";
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

  if (!material || !isGuestMaterialAvailable(material)) {
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
