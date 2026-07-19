import {
  HistoryEmptyState,
  HistoryFilters,
  HistoryGroupsList,
} from "@/components/history/HistorySections";
import { getListeningHistoryPageData } from "@/lib/history/queries";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const data = await getListeningHistoryPageData(
    supabase,
    user.id,
    params.filter,
  );

  return (
    <>
      <div className="hidden xl:block">
        <h1 className="text-[28px] font-semibold">История</h1>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Что вы слушали и где остановились
        </p>
      </div>

      <HistoryFilters activeFilter={data.filter} />

      {data.filteredCount === 0 ? (
        <HistoryEmptyState filter={data.filter} />
      ) : (
        <HistoryGroupsList groups={data.groups} />
      )}
    </>
  );
}
