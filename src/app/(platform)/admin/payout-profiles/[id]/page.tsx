import Link from "next/link";
import { notFound } from "next/navigation";

import PayoutProfileReviewForm from "@/components/admin/PayoutProfileReviewForm";
import { requireAdminPermission } from "@/lib/admin/guard";
import { getAdminPayoutProfileDetail } from "@/lib/author-payout-profiles/service";
import { getAuthorPayoutProfileStatusLabel } from "@/lib/author-payout-profiles/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function AdminPayoutProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission("authors.payout_profiles.review");
  const { id } = await params;

  let profile;

  try {
    const service = createServiceRoleClient();
    profile = await getAdminPayoutProfileDetail(service, id);
  } catch (error) {
    console.error("admin_payout_profile_detail_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить анкету. Попробуйте обновить страницу.
      </div>
    );
  }

  if (!profile) {
    notFound();
  }

  return (
    <section aria-labelledby="admin-payout-profile-detail-heading">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/payout-profiles"
            className="text-sm font-medium text-[#7042c5]"
          >
            ← К списку анкет
          </Link>
          <h2
            id="admin-payout-profile-detail-heading"
            className="mt-2 text-[21px] font-semibold"
          >
            {profile.author_name}
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Статус: {getAuthorPayoutProfileStatusLabel(profile.status)}
          </p>
        </div>
      </div>

      <PayoutProfileReviewForm profile={profile} />
    </section>
  );
}
