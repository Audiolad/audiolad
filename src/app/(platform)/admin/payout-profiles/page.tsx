import Link from "next/link";

import PayoutProfilesList from "@/components/admin/PayoutProfilesList";
import { listAdminPayoutProfiles } from "@/lib/author-payout-profiles/service";
import { requireAdminPermission } from "@/lib/admin/guard";
import {
  ADMIN_PAYOUT_PROFILE_FILTERS,
  resolveAdminPayoutProfileFilter,
} from "@/lib/author-payout-profiles/admin-status";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function AdminPayoutProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("authors.payout_profiles.review");
  const params = await searchParams;
  const status = resolveAdminPayoutProfileFilter(params.status);
  const activeFilter = status;

  let profiles;

  try {
    const service = createServiceRoleClient();
    profiles = await listAdminPayoutProfiles(service, { status });
  } catch (error) {
    console.error("admin_payout_profiles_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить анкеты. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section aria-labelledby="admin-payout-profiles-heading">
      <h2
        id="admin-payout-profiles-heading"
        className="text-[21px] font-semibold"
      >
        Данные для выплат
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#796ba0]">
        Проверка анкет авторов для начисления и перечисления вознаграждения.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ADMIN_PAYOUT_PROFILE_FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={
              filter.key === "all"
                ? "/admin/payout-profiles"
                : `/admin/payout-profiles?status=${filter.key}`
            }
            aria-current={activeFilter === filter.key ? "page" : undefined}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
              activeFilter === filter.key
                ? "bg-[#7042c5] text-white"
                : "border border-[#e4d7f4] bg-white text-[#7042c5]"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-5">
        <PayoutProfilesList profiles={profiles} />
      </div>
    </section>
  );
}
