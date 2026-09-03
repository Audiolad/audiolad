import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import { authorAccessAllowsPaidProducts } from "@/lib/authors/access";
import { loadAuthorAppreciationSettings } from "@/lib/author-appreciation/settings";

export async function GET(request: Request) {
  try {
    const authorId = new URL(request.url).searchParams.get("author_id")?.trim();
    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, accessStatus } = await requireAuthorMembership(authorId);
    const settings = await loadAuthorAppreciationSettings(supabase, authorId);
    return NextResponse.json({
      eligible: authorAccessAllowsPaidProducts(accessStatus),
      settings,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId = typeof body.author_id === "string" ? body.author_id.trim() : "";
    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, accessStatus } = await requireAuthorMutationMembership(
      authorId,
      { action: "author_appreciation_settings_updated" },
    );
    if (!authorAccessAllowsPaidProducts(accessStatus)) {
      return NextResponse.json({ error: "appreciation_not_eligible" }, { status: 403 });
    }

    const keys = [
      "listener_appreciation_enabled",
      "listener_appreciation_profile_enabled",
      "listener_appreciation_free_products_default",
    ] as const;
    const updates: Record<string, boolean | string> = { author_id: authorId };

    for (const key of keys) {
      if (key in body) {
        if (typeof body[key] !== "boolean") {
          return NextResponse.json({ error: "invalid_request" }, { status: 400 });
        }
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const current = await loadAuthorAppreciationSettings(supabase, authorId);
    const { data, error } = await supabase
      .from("author_appreciation_settings")
      .upsert(
        {
          author_id: authorId,
          listener_appreciation_enabled:
            updates.listener_appreciation_enabled ?? current.enabled,
          listener_appreciation_profile_enabled:
            updates.listener_appreciation_profile_enabled ?? current.profileEnabled,
          listener_appreciation_free_products_default:
            updates.listener_appreciation_free_products_default ??
            current.freeProductsDefault,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "author_id" },
      )
      .select(
        "listener_appreciation_enabled, listener_appreciation_profile_enabled, listener_appreciation_free_products_default",
      )
      .single();
    if (error) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({
      eligible: true,
      settings: {
        enabled: data.listener_appreciation_enabled,
        profileEnabled: data.listener_appreciation_profile_enabled,
        freeProductsDefault: data.listener_appreciation_free_products_default,
      },
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
