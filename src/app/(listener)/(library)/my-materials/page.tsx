import { redirect } from "next/navigation";

import MyMaterialsList from "@/components/personal-materials/library/MyMaterialsList";
import PersonalMaterialPrivacyLabel from "@/components/personal-materials/PersonalMaterialPrivacyLabel";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { listMyPersonalMaterials } from "@/lib/personal-materials/client-library/repository";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Личные материалы – АудиоЛад",
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
      <header className="mb-6 space-y-3">
        <h1 className="text-2xl font-semibold text-[#2f2647]">Личные материалы</h1>
        <p className="text-sm leading-6 text-[#6d628f]">
          Здесь хранятся материалы, подготовленные автором лично для вас. Они
          доступны только в вашем аккаунте.
        </p>
        <PersonalMaterialPrivacyLabel text="Только для вас" />
      </header>
      <MyMaterialsList materials={materials} />
    </div>
  );
}
