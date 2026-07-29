import { notFound, redirect } from "next/navigation";

import PrivateAudioDetailClient from "@/components/private-audio/PrivateAudioDetailClient";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { PrivateAudioApiError } from "@/lib/private-audio/server/errors";
import { getPrivateAudioDetail } from "@/lib/private-audio/server/repository";
import type { PrivateAudioDetailDto } from "@/lib/private-audio/types";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata() {
  return {
    title: "Аудиоматериал – АудиоЛад",
    robots: PRIVATE_PAGE_ROBOTS,
  };
}

export default async function PrivateAudioDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      buildAuthRouteHref(
        "/auth/sign-in",
        `/my-library/private-audio/${encodeURIComponent(id)}`,
      ),
    );
  }

  let item: PrivateAudioDetailDto;

  try {
    item = await getPrivateAudioDetail(supabase, user.id, id);
  } catch (error) {
    if (error instanceof PrivateAudioApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-24 xl:pt-2">
      <PrivateAudioDetailClient item={item} />
    </div>
  );
}
