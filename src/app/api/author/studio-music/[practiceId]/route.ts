import { NextResponse } from "next/server";

import {
  assertAuthorCommercialWriteAllowed,
  handleAuthorRouteError,
  requireAuthorMutationMembership,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { AuthorTermsAcceptanceRequiredError } from "@/lib/author-terms/errors";
import {
  assertCanEnableStudioMusic,
  buildStudioDisableFields,
  buildStudioEnableFields,
} from "@/lib/author-studio-music/management";
import {
  wouldCreateNewStudioFreeState,
  studioNewFreeDisabledResponseBody,
} from "@/lib/studio-music/new-free-policy";
import { mapPracticeToStudioMusicListItem } from "@/lib/author-studio-music/management";
import { getMusicReleaseLabel } from "@/lib/author-products/product-kind";

type RouteContext = {
  params: Promise<{ practiceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { practiceId } = await context.params;
    if (!practiceId?.trim()) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const enabled =
      "enabled" in body && typeof (body as { enabled?: unknown }).enabled === "boolean"
        ? (body as { enabled: boolean }).enabled
        : null;
    if (enabled === null) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const priceRublesRaw = (body as { priceRubles?: unknown }).priceRubles;
    const priceRubles =
      priceRublesRaw === undefined || priceRublesRaw === null
        ? null
        : typeof priceRublesRaw === "number"
          ? priceRublesRaw
          : NaN;
    if (priceRublesRaw != null && !Number.isInteger(priceRubles)) {
      return NextResponse.json({ error: "studio_music_invalid_price" }, { status: 400 });
    }

    const access = await requirePracticeMutationAccess(practiceId);
    const { supabase, practice, accessStatus } = access;
    await requireAuthorMutationMembership(practice.author_id);

    if (enabled) {
      const gate = assertCanEnableStudioMusic({
        accessStatus,
        productKind: practice.product_kind,
        status: practice.status,
      });
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.code, message: gate.message },
          { status: gate.status },
        );
      }
      try {
        await assertAuthorCommercialWriteAllowed(practice.author_id, accessStatus);
      } catch (error) {
        if (error instanceof AuthorTermsAcceptanceRequiredError) {
          throw error;
        }
        throw error;
      }

      const fields = buildStudioEnableFields({ priceRubles });
      if (!fields.ok) {
        return NextResponse.json(
          { error: fields.code, message: fields.message },
          { status: 400 },
        );
      }

      if (
        wouldCreateNewStudioFreeState({
          oldRow: {
            author_id: practice.author_id,
            deleted_at: practice.deleted_at,
            music_usage_permission: practice.music_usage_permission,
            studio_music_pricing_mode: practice.studio_music_pricing_mode,
            is_free: practice.is_free,
            price: practice.price,
          },
          newRow: {
            author_id: practice.author_id,
            deleted_at: practice.deleted_at,
            music_usage_permission: fields.music_usage_permission,
            studio_music_pricing_mode: fields.studio_music_pricing_mode,
            is_free: practice.is_free,
            price: practice.price,
          },
        })
      ) {
        // enable is always FIXED paid — should not hit; defensive
        return NextResponse.json(studioNewFreeDisabledResponseBody(), { status: 409 });
      }

      const { error: updateError } = await supabase
        .from("practices")
        .update({
          music_usage_permission: fields.music_usage_permission,
          studio_music_pricing_mode: fields.studio_music_pricing_mode,
          studio_music_price_minor: fields.studio_music_price_minor,
        })
        .eq("id", practiceId);

      if (updateError) {
        return NextResponse.json({ error: "save_failed" }, { status: 500 });
      }
    } else {
      // Disable Studio participation — requires commercial write; entitlements untouched.
      if (!isAuthorCommercial(accessStatus)) {
        return NextResponse.json(
          {
            error: "studio_music_commercial_required",
            message:
              "Музыку можно настроить в Студии после получения коммерческого статуса.",
          },
          { status: 403 },
        );
      }
      await assertAuthorCommercialWriteAllowed(practice.author_id, accessStatus);

      const fields = buildStudioDisableFields();
      const { error: updateError } = await supabase
        .from("practices")
        .update({
          music_usage_permission: fields.music_usage_permission,
          studio_music_pricing_mode: fields.studio_music_pricing_mode,
          studio_music_price_minor: fields.studio_music_price_minor,
        })
        .eq("id", practiceId);

      if (updateError) {
        return NextResponse.json({ error: "save_failed" }, { status: 500 });
      }
    }

    const { data: refreshed, error: refreshError } = await supabase
      .from("practices")
      .select(
        "id, title, slug, cover_url, cover_image, status, moderation_status, is_free, price, music_usage_permission, studio_music_pricing_mode, studio_music_price_minor, deleted_at, product_kind",
      )
      .eq("id", practiceId)
      .maybeSingle();

    if (refreshError || !refreshed) {
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    }

    const { count } = await supabase
      .from("audio_items")
      .select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId);

    const item = mapPracticeToStudioMusicListItem({
      practice: {
        id: refreshed.id,
        title: refreshed.title,
        slug: refreshed.slug,
        cover_url: refreshed.cover_url,
        cover_image: refreshed.cover_image,
        status: refreshed.status,
        moderation_status: refreshed.moderation_status,
        is_free: refreshed.is_free === true,
        price: Number(refreshed.price ?? 0),
        music_usage_permission: refreshed.music_usage_permission,
        studio_music_pricing_mode: refreshed.studio_music_pricing_mode,
        studio_music_price_minor: refreshed.studio_music_price_minor,
        deleted_at: refreshed.deleted_at,
      },
      trackCount: count ?? 0,
      kindLabel: getMusicReleaseLabel(count ?? 0),
    });

    return NextResponse.json({ item });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

function isAuthorCommercial(status: string): boolean {
  return status === "commercial_active" || status === "commercial";
}
