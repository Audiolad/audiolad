import { NextResponse } from "next/server";

import {
  getPlatformAccess,
  snapshotHasPermission,
} from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

const PREVIEW_EXPIRES_IN = 3600;

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const access = await getPlatformAccess(supabase, user.id);

  if (
    !snapshotHasPermission(access, "admin_panel.access") ||
    !snapshotHasPermission(access, "author_products.moderate")
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id, audioId } = await context.params;
  const service = createServiceRoleClient();

  const { data: practice, error: practiceError } = await service
    .from("practices")
    .select("id, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (practiceError) {
    console.error("admin_moderation_audio_practice_error", practiceError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!practice?.id || practice.deleted_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: audioItem, error: audioError } = await service
    .from("audio_items")
    .select("id, audio_path")
    .eq("id", audioId)
    .eq("practice_id", id)
    .maybeSingle();

  if (audioError) {
    console.error("admin_moderation_audio_lookup_error", audioError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!audioItem?.id || !audioItem.audio_path?.trim()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data, error: signedError } = await service.storage
    .from("practice-audio")
    .createSignedUrl(audioItem.audio_path, PREVIEW_EXPIRES_IN);

  if (signedError || !data?.signedUrl) {
    console.error(
      "admin_moderation_audio_signed_url_error",
      signedError?.message,
    );
    return NextResponse.json({ error: "preview_unavailable" }, { status: 500 });
  }

  return NextResponse.json(
    {
      url: data.signedUrl,
      expiresIn: PREVIEW_EXPIRES_IN,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
