import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { syncPracticeAudioCompatibility } from "@/lib/author-products/publish";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    const { data: audioItem, error: audioLookupError } = await supabase
      .from("audio_items")
      .select("id, audio_path")
      .eq("id", audioId)
      .eq("practice_id", id)
      .maybeSingle();

    if (audioLookupError) {
      console.error("author_audio_file_delete_lookup_error", audioLookupError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!audioItem?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (audioItem.audio_path) {
      await supabase.storage
        .from("practice-audio")
        .remove([audioItem.audio_path]);
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("audio_items")
      .update({
        audio_path: null,
        duration_seconds: null,
        original_file_name: null,
        file_size_bytes: null,
        updated_at: now,
      })
      .eq("id", audioId)
      .eq("practice_id", id);

    if (updateError) {
      console.error("author_audio_file_delete_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    await syncPracticeAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
