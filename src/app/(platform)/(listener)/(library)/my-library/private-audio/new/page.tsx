import Link from "next/link";
import { redirect } from "next/navigation";

import PrivateAudioForm from "@/components/private-audio/PrivateAudioForm";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Добавить аудиоматериал – АудиоЛад",
    robots: PRIVATE_PAGE_ROBOTS,
  };
}

export default async function NewPrivateAudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      buildAuthRouteHref("/auth/sign-in", "/my-library/private-audio/new"),
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-24 xl:pt-2">
      <div className="mb-4">
        <Link
          href="/my-practices?filter=uploads"
          className="text-sm font-medium text-[#7042c5]"
        >
          ← Мои загрузки
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-[28px] font-semibold text-[#25135c]">
          Добавить аудиоматериал
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
          Загрузите свой MP3-файл для личного прослушивания в АудиоЛаде. Материал
          будет виден только вам.
        </p>
      </header>

      <div className="rounded-[24px] border border-[#eadff8] bg-white p-5 sm:p-6">
        <PrivateAudioForm />
      </div>
    </div>
  );
}
