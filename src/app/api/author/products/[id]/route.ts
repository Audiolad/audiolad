import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import {
  generateUniqueSlug,
  getAuthorProductDetail,
  isPracticeSlugTaken,
} from "@/lib/author-products/products";
import { syncSingleAudioCompatibility } from "@/lib/author-products/publish";
import { PAID_PRICE_OPTIONS } from "@/lib/author-products/types";
import { slugifyTitle } from "@/lib/author-products/utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);
    const product = await getAuthorProductDetail(supabase, id);

    if (!product) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeAccess(id);

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

      updates.title = title;
    }

    if ("subtitle" in body) {
      updates.subtitle = parseOptionalString(body.subtitle)?.trim() || null;
    }

    if ("description" in body) {
      updates.description = parseOptionalString(body.description)?.trim() || null;
    }

    if ("format" in body) {
      updates.format = parseOptionalString(body.format)?.trim() || null;
    }

    if ("is_free" in body && typeof body.is_free === "boolean") {
      updates.is_free = body.is_free;

      if (body.is_free) {
        updates.price = 0;
      }
    }

    if (
      "price" in body &&
      typeof body.price === "number" &&
      Number.isInteger(body.price)
    ) {
      if (!PAID_PRICE_OPTIONS.includes(body.price as (typeof PAID_PRICE_OPTIONS)[number])) {
        return NextResponse.json({ error: "invalid_price" }, { status: 400 });
      }

      updates.price = body.price;
      updates.is_free = false;
    }

    if ("slug" in body && typeof body.slug === "string") {
      if (practice.status === "published" || practice.published_at) {
        return NextResponse.json({ error: "slug_locked" }, { status: 400 });
      }

      const requestedSlug = slugifyTitle(body.slug) || slugifyTitle(String(updates.title ?? ""));

      if (!requestedSlug) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }

      if (await isPracticeSlugTaken(supabase, requestedSlug, id)) {
        return NextResponse.json({ error: "slug_taken" }, { status: 409 });
      }

      updates.slug = requestedSlug;
    } else if (
      "title" in body &&
      typeof body.title === "string" &&
      practice.status !== "published" &&
      !practice.published_at
    ) {
      updates.slug = await generateUniqueSlug(supabase, body.title.trim(), id);
    }

    if (
      "author_id" in body &&
      typeof body.author_id === "string" &&
      body.author_id.trim()
    ) {
      if (practice.status === "published" || practice.published_at) {
        return NextResponse.json({ error: "author_locked" }, { status: 400 });
      }

      const nextAuthorId = body.author_id.trim();
      const { data: membership } = await supabase
        .from("author_members")
        .select("role")
        .eq("author_id", nextAuthorId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        !membership ||
        (membership.role !== "owner" && membership.role !== "editor")
      ) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      updates.author_id = nextAuthorId;
    }

    const { error: updateError } = await supabase
      .from("practices")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      console.error("author_product_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    await syncSingleAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    if (!product) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
