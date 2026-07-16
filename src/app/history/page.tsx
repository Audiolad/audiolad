import BottomNav from "@/components/BottomNav";
import {
  HistoryEmptyState,
  HistoryFilters,
  HistoryGroupsList,
  HistoryPageHeader,
} from "@/components/history/HistorySections";
import { getListeningHistoryPageData } from "@/lib/history/queries";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
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
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-5">
          <HistoryPageHeader />
          <HistoryFilters activeFilter={data.filter} />

          {data.filteredCount === 0 ? (
            <HistoryEmptyState filter={data.filter} />
          ) : (
            <HistoryGroupsList groups={data.groups} />
          )}
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
