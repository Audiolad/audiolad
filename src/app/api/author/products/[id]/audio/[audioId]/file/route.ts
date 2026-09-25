import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { syncPracticeAudioCompatibility } from "@/lib/author-products/publish";
import {
  PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
  assertPracticeContentMutable,
  isPracticeSaleLockError,
  isProductContentLockedDbError,
  saleLockConflictResponse,
} from "@/lib/author-products/sale-lock";
import {
  AUDIO_PREPARING_CODE,
  AUDIO_PREPARING_MESSAGE,
  isProductAudioNormalizeInFlight,
} from "@/lib/author-products/server/direct-audio-upload";
import { teardownMusicTrackDelivery } from "@/lib/author-products/server/music-track-delivery";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);
    const serviceSupabase = createServiceRoleClient();

    try {
      await assertPracticeContentMutable(serviceSupabase, id);
    } catch (error) {
      if (isPracticeSaleLockError(error)) {
        return NextResponse.json(
          saleLockConflictResponse(PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE),
          { status: 409 },
        );
      }

      throw error;
    }

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

    const isMusic = practice.product_kind === "music";

    if (!isMusic && (await isProductAudioNormalizeInFlight(id, audioId))) {
      return NextResponse.json(
        { error: AUDIO_PREPARING_CODE, message: AUDIO_PREPARING_MESSAGE },
        { status: 409 },
      );
    }

    if (isMusic) {
      try {
        const torn = await teardownMusicTrackDelivery({
          practiceId: id,
          audioId,
          deleteItem: false,
        });
        if (torn.status === "not_found") {
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
      } catch (error) {
        if (isProductContentLockedDbError(error)) {
          return NextResponse.json(
            saleLockConflictResponse(PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE),
            { status: 409 },
          );
        }

        console.error(
          "author_audio_file_delete_update_error",
          error instanceof Error ? error.message : "unknown",
        );
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      await syncPracticeAudioCompatibility(supabase, id);
      const product = await getAuthorProductDetail(supabase, id);
      return NextResponse.json({ product });
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
      if (isProductContentLockedDbError(updateError)) {
        return NextResponse.json(
          saleLockConflictResponse(PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE),
          { status: 409 },
        );
      }

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
