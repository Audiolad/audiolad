import { notFound, redirect } from "next/navigation";

import MyMaterialDetailClient from "@/components/personal-materials/library/MyMaterialDetailClient";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { getMyPersonalMaterial } from "@/lib/personal-materials/client-library/repository";
import { PersonalMaterialApiError } from "@/lib/personal-materials/server/errors";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata() {
  return {
    title: "Мои материалы — АудиоЛад",
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function MyMaterialDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      buildAuthRouteHref("/auth/sign-in", `/my-materials/${encodeURIComponent(id)}`),
    );
  }

  let material;

  try {
    material = await getMyPersonalMaterial(supabase, id);
  } catch (error) {
    if (error instanceof PersonalMaterialApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:py-8">
      <MyMaterialDetailClient material={material} />
    </div>
  );
}
