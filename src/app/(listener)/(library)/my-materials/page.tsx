import { redirect } from "next/navigation";

import MyMaterialsList from "@/components/personal-materials/library/MyMaterialsList";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { listMyPersonalMaterials } from "@/lib/personal-materials/client-library/repository";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Мои материалы — АудиоЛад",
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function MyMaterialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildAuthRouteHref("/auth/sign-in", "/my-materials"));
  }

  const materials = await listMyPersonalMaterials(supabase);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:py-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-[#2f2647]">Мои материалы</h1>
        <p className="text-sm leading-6 text-[#6d628f]">
          Здесь хранятся персональные аудиодиагностики и другие материалы,
          подготовленные специально для вас.
        </p>
      </header>
      <MyMaterialsList materials={materials} />
    </div>
  );
}
