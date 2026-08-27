import { Suspense } from "react";

import MyPracticesLibrary from "@/components/my-practices/MyPracticesLibrary";
import { loadUnifiedLibrary } from "@/lib/library/unified";
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

  const { entries, error } = await loadUnifiedLibrary(supabase, user.id);

  return (
    <>
      <div className="hidden xl:block">
        <h1 className="text-[28px] font-semibold">Аудиотека</h1>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Всё, что вы сохранили, купили, получили или добавили
        </p>
      </div>

      <Suspense
        fallback={
          <div className="mt-6 text-sm text-[#7d70a2]">Загружаем аудиотеку…</div>
        }
      >
        <MyPracticesLibrary
          entries={entries}
          error={error}
          purchasedSlug={purchasedSlug}
        />
      </Suspense>
    </>
  );
}
