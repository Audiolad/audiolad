import { notFound, redirect } from "next/navigation";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import { getPersonalMaterialTypeLabel } from "@/lib/personal-materials/client/status-labels";
import { getGuestDisplayTitle } from "@/lib/personal-materials/guest/display";
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
    redirect(buildAuthRouteHref("/auth/sign-in", `/my-materials/${encodeURIComponent(id)}`));
  }

  const { data, error } = await supabase.rpc("get_claimed_personal_material", {
    p_material_id: id,
  });

  if (error || !data || typeof data !== "object") {
    notFound();
  }

  const material = data as Record<string, unknown>;
  const title = getGuestDisplayTitle(
    typeof material.title === "string" ? material.title : null,
    typeof material.material_type === "string" ? material.material_type : "diagnostic",
  );
  const authorName =
    typeof material.author_name === "string" ? material.author_name : "Автор";
  const typeLabel = getPersonalMaterialTypeLabel(
    typeof material.material_type === "string" ? material.material_type : "diagnostic",
  );

  return (
    <div className="min-h-dvh bg-[#f7f4fb] px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-[#7042c5]">Диагностика сохранена</p>
        <h1 className="mt-2 break-words text-2xl font-semibold text-[#2f2647]">{title}</h1>
        <p className="mt-2 text-sm text-[#6d628f]">
          {typeLabel} · {authorName}
        </p>
        <p className="mt-6 text-sm leading-6 text-[#5f5484]">
          Материал сохранён в вашем личном кабинете. Полный раздел «Мои материалы» будет
          расширен на следующем этапе.
        </p>
        <a
          href="/my-practices"
          className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Перейти в библиотеку
        </a>
      </div>
    </div>
  );
}
