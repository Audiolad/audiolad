import { NextResponse } from "next/server";

import {
  validateAudioDescriptionLength,
  validateAudioTitleLength,
} from "@/lib/author-products/limits";
import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { syncPracticeAudioCompatibility } from "@/lib/author-products/publish";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("title" in body && typeof body.title === "string") {
      const title = body.title.trim();

      if (!title) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }

      const titleError = validateAudioTitleLength(title);

      if (titleError) {
        return NextResponse.json({ error: titleError }, { status: 400 });
      }

      updates.title = title;
    }

    if ("description" in body) {
      const description =
        typeof body.description === "string"
          ? body.description.trim()
          : "";

      const descriptionError = validateAudioDescriptionLength(description);

      if (descriptionError) {
        return NextResponse.json({ error: descriptionError }, { status: 400 });
      }

      updates.description = description || null;
    }

    const { data: audioItem, error: updateError } = await supabase
      .from("audio_items")
      .update(updates)
      .eq("id", audioId)
      .eq("practice_id", id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("author_audio_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!audioItem?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    await syncPracticeAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    const { count, error: countError } = await supabase
      .from("audio_items")
      .select("id", { count: "exact", head: true })
      .eq("practice_id", id);

    if (countError) {
      console.error("author_audio_count_error", countError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "last_audio_required", message: "У продукта должно остаться хотя бы одно аудио." },
        { status: 400 },
      );
    }

    const { data: audioItem, error: lookupError } = await supabase
      .from("audio_items")
      .select("id, audio_path")
      .eq("id", audioId)
      .eq("practice_id", id)
      .maybeSingle();

    if (lookupError) {
      console.error("author_audio_lookup_error", lookupError.message);
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

    const { error: deleteError } = await supabase
      .from("audio_items")
      .delete()
      .eq("id", audioId)
      .eq("practice_id", id);

    if (deleteError) {
      console.error("author_audio_delete_error", deleteError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const { data: remaining, error: remainingError } = await supabase
      .from("audio_items")
      .select("id, position")
      .eq("practice_id", id)
      .order("position", { ascending: true });

    if (remainingError) {
      console.error("author_audio_reorder_lookup_error", remainingError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    for (const [index, item] of (remaining ?? []).entries()) {
      const nextPosition = index + 1;

      if (item.position === nextPosition) {
        continue;
      }

      await supabase
        .from("audio_items")
        .update({ position: nextPosition, updated_at: new Date().toISOString() })
        .eq("id", item.id);
    }

    await syncPracticeAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
