import { Suspense } from "react";

import MyPracticesLibrary from "@/components/my-practices/MyPracticesLibrary";
import { loadLibraryCollection } from "@/lib/library/collection";
import { listPrivateAudioItems } from "@/lib/private-audio/server/repository";
import type { PrivateAudioListItemDto } from "@/lib/private-audio/types";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MyPracticesPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const purchasedSlug = resolvedSearchParams.purchased?.trim() || null;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const [{ items: libraryItems, error }, privateAudio] = await Promise.all([
    loadLibraryCollection(supabase, user.id),
    listPrivateAudioItems(supabase, user.id)
      .then((items) => ({ items, error: false }))
      .catch(() => ({
        items: [] as PrivateAudioListItemDto[],
        error: true,
      })),
  ]);

  return (
    <>
      <div className="hidden xl:block">
        <h1 className="text-[28px] font-semibold">Аудиотека</h1>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Ваши подарки, купленные и личные материалы
        </p>
      </div>

      <Suspense
        fallback={
          <div className="mt-6 text-sm text-[#7d70a2]">Загружаем аудиотеку…</div>
        }
      >
        <MyPracticesLibrary
          items={libraryItems}
          error={error}
          purchasedSlug={purchasedSlug}
          initialPrivateItems={privateAudio.items}
          privateError={privateAudio.error}
        />
      </Suspense>
    </>
  );
}
