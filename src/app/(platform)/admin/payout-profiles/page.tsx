import Link from "next/link";

import PayoutProfilesList from "@/components/admin/PayoutProfilesList";
import { listAdminPayoutProfiles } from "@/lib/author-payout-profiles/service";
import { requireAdminPermission } from "@/lib/admin/guard";
import {
  AUTHOR_PAYOUT_PROFILE_STATUSES,
  getAuthorPayoutProfileStatusLabel,
  type AuthorPayoutProfileStatus,
} from "@/lib/author-payout-profiles/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const FILTER_STATUSES = [
  "all",
  ...AUTHOR_PAYOUT_PROFILE_STATUSES.filter(
    (status) => status !== "draft",
  ),
] as const;

function resolveFilterStatus(
  value: string | undefined,
): AuthorPayoutProfileStatus | "all" {
  if (!value || value === "all") {
    return "all";
  }

  if (
    (AUTHOR_PAYOUT_PROFILE_STATUSES as readonly string[]).includes(value) &&
    value !== "draft"
  ) {
    return value as AuthorPayoutProfileStatus;
  }

  return "all";
}

export default async function AdminPayoutProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("authors.payout_profiles.review");
  const params = await searchParams;
  const status = resolveFilterStatus(params.status);
  const activeFilter = params.status ?? "all";

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
        {FILTER_STATUSES.map((filterKey) => (
          <Link
            key={filterKey}
            href={
              filterKey === "all"
                ? "/admin/payout-profiles"
                : `/admin/payout-profiles?status=${filterKey}`
            }
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
              activeFilter === filterKey
                ? "bg-[#7042c5] text-white"
                : "border border-[#e4d7f4] bg-white text-[#7042c5]"
            }`}
          >
            {filterKey === "all"
              ? "Все"
              : getAuthorPayoutProfileStatusLabel(
                  filterKey as AuthorPayoutProfileStatus,
                )}
          </Link>
        ))}
      </div>

      <div className="mt-5">
        <PayoutProfilesList profiles={profiles} />
      </div>
    </section>
  );
}
