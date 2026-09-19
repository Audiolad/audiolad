import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { getMusicReleaseLabel, isMusicProductKind } from "@/lib/author-products/product-kind";
import { authorAccessAllowsPaidProducts } from "@/lib/authors/access";
import {
  mapPracticeToStudioMusicListItem,
  type AuthorStudioMusicListResponse,
} from "@/lib/author-studio-music/management";

function parseAuthorId(request: Request): string | null {
  const url = new URL(request.url);
  const authorId = url.searchParams.get("author_id")?.trim();
  return authorId || null;
}

export async function GET(request: Request) {
  try {
    const authorId = parseAuthorId(request);
    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, accessStatus } = await requireAuthorMembership(authorId);

    const { data: practices, error } = await supabase
      .from("practices")
      .select(
        "id, title, slug, cover_url, cover_image, status, moderation_status, is_free, price, music_usage_permission, studio_music_pricing_mode, studio_music_price_minor, deleted_at, product_kind, publication_class, updated_at",
      )
      .eq("author_id", authorId)
      .is("deleted_at", null)
      .eq("product_kind", "music")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    }

    const rows = (practices ?? []).filter((row) =>
      isMusicProductKind(row.product_kind),
    );
    const ids = rows.map((r) => r.id);
    const trackCountByPractice = new Map<string, number>();
    if (ids.length > 0) {
      const { data: audioRows, error: audioError } = await supabase
        .from("audio_items")
        .select("id, practice_id")
        .in("practice_id", ids);
      if (audioError) {
        return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
      }
      for (const audio of audioRows ?? []) {
        const pid = String(audio.practice_id);
        trackCountByPractice.set(pid, (trackCountByPractice.get(pid) ?? 0) + 1);
      }
    }

    const items = rows.map((practice) => {
      const trackCount = trackCountByPractice.get(practice.id) ?? 0;
      return mapPracticeToStudioMusicListItem({
        practice: {
          id: practice.id,
          title: practice.title,
          slug: practice.slug,
          cover_url: practice.cover_url,
          cover_image: practice.cover_image,
          status: practice.status,
          moderation_status: practice.moderation_status,
          is_free: practice.is_free === true,
          price: Number(practice.price ?? 0),
          music_usage_permission: practice.music_usage_permission,
          studio_music_pricing_mode: practice.studio_music_pricing_mode,
          studio_music_price_minor: practice.studio_music_price_minor,
          deleted_at: practice.deleted_at,
        },
        trackCount,
        kindLabel: getMusicReleaseLabel(trackCount),
      });
    });

    const inStudioCount = items.filter((i) => i.inStudio).length;
    const body: AuthorStudioMusicListResponse = {
      accessStatus,
      canManageStudio: authorAccessAllowsPaidProducts(accessStatus),
      items,
      inStudioCount,
      notInStudioCount: items.length - inStudioCount,
    };

    return NextResponse.json(body);
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
