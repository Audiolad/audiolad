import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import EditorialPlaylistEditorClient from "@/components/playlists/editorial/EditorialPlaylistEditorClient";
import { loadEditorialWorkspaceDetail } from "@/lib/playlists/editorial-workspace-detail";
import { isUuid } from "@/lib/playlists/validation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditorialPlaylistEditorPage({
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
    redirect(`/auth/sign-in?next=/editorial/playlists/${id}`);
  }

  const loaded = await loadEditorialWorkspaceDetail(supabase, user.id, id);

  if (!loaded.ok) {
    if (loaded.reason === "forbidden" || loaded.reason === "not_found") {
      notFound();
    }

    return (
      <section className="px-5 py-8">
        <p className="text-[16px] font-medium">
          Не удалось загрузить плейлист. Попробуйте ещё раз.
        </p>
        <Link
          href="/editorial/playlists"
          className="mt-5 inline-flex rounded-full border border-[#bda6e1] px-5 py-2.5 text-sm font-medium text-[#7042c5]"
        >
          К открытым плейлистам
        </Link>
      </section>
    );
  }

  return (
    <EditorialPlaylistEditorClient
      key={`${loaded.detail.playlist.updated_at}-${loaded.detail.itemsCount}-${loaded.detail.playlist.slug ?? ""}`}
      detail={loaded.detail}
    />
  );
}
