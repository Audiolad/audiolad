import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import EditorialDirectionDetailClient from "@/components/playlists/editorial/EditorialDirectionDetailClient";
import { listEditorialDirectionsForManage } from "@/lib/playlists/editorial-directions";
import { getEditorialWorkspaceAccess } from "@/lib/playlists/editorial-workspace";
import { isUuid } from "@/lib/playlists/validation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditorialDirectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?next=/editorial/directions/${id}`);
  }

  const access = await getEditorialWorkspaceAccess(supabase, user.id);

  if (!access.canManageDirections) {
    notFound();
  }

  const { directions, error } = await listEditorialDirectionsForManage(supabase);

  if (error) {
    console.error("editorial_direction_detail_page_load_error", error);
    return (
      <section className="px-5 py-8">
        <p className="text-[16px] font-medium">
          Не удалось загрузить направление. Попробуйте ещё раз.
        </p>
        <Link
          href="/editorial/directions"
          className="mt-5 inline-flex rounded-full border border-[#bda6e1] px-5 py-2.5 text-sm font-medium text-[#7042c5]"
        >
          К направлениям
        </Link>
      </section>
    );
  }

  const direction = directions.find((row) => row.id === id);

  if (!direction) {
    notFound();
  }

  return <EditorialDirectionDetailClient direction={direction} />;
}
