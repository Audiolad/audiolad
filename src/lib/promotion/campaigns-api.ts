import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
} from "@/lib/author-products/auth";
import {
  buildCampaignKeyFromName,
  normalizeCampaignKey,
  validateCampaignKey,
  validateCampaignName,
} from "@/lib/promotion/campaign-key";
import {
  getPromotionPeriodBounds,
  parsePromotionPeriod,
} from "@/lib/promotion/dates";
import {
  requireAuthorPromotionAccess,
  requireAuthorPromotionMutationAccess,
} from "@/lib/promotion/access";
import type {
  PromotionCampaignSummaryRow,
  PromotionCampaignWithProduct,
} from "@/lib/promotion/types";

function parseAuthorId(request: Request): string | null {
  const url = new URL(request.url);
  const authorId = url.searchParams.get("author_id")?.trim();
  return authorId || null;
}

export function mapPromotionCampaignRow(
  row: Record<string, unknown>,
): PromotionCampaignWithProduct {
  const practice = Array.isArray(row.practices)
    ? row.practices[0]
    : row.practices;
  const author = practice?.authors
    ? Array.isArray(practice.authors)
      ? practice.authors[0]
      : practice.authors
    : null;

  return {
    id: String(row.id),
    author_id: String(row.author_id),
    practice_id: String(row.practice_id),
    name: String(row.name),
    campaign_key: String(row.campaign_key),
    status: row.status === "archived" ? "archived" : "active",
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    practice_title: String(practice?.title ?? ""),
    practice_slug: String(practice?.slug ?? ""),
    practice_status: String(practice?.status ?? ""),
    author_slug: String(author?.slug ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const authorId = parseAuthorId(request);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorPromotionAccess(authorId);

    const { data, error } = await supabase
      .from("promotion_campaigns")
      .select(
        `
        id,
        author_id,
        practice_id,
        name,
        campaign_key,
        status,
        created_by,
        created_at,
        updated_at,
        practices (
          title,
          slug,
          status,
          authors!practices_author_id_fkey (
            slug
          )
        )
      `,
      )
      .eq("author_id", authorId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("promotion_campaigns_list_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({
      campaigns: (data ?? []).map((row) =>
        mapPromotionCampaignRow(row as Record<string, unknown>),
      ),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const authorId =
      "author_id" in body && typeof body.author_id === "string"
        ? body.author_id.trim()
        : "";
    const practiceId =
      "practice_id" in body && typeof body.practice_id === "string"
        ? body.practice_id.trim()
        : "";
    const name =
      "name" in body && typeof body.name === "string" ? body.name.trim() : "";
    const rawCampaignKey =
      "campaign_key" in body && typeof body.campaign_key === "string"
        ? body.campaign_key
        : buildCampaignKeyFromName(name);

    const nameError = validateCampaignName(name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const campaignKey = normalizeCampaignKey(rawCampaignKey);
    const keyError = validateCampaignKey(campaignKey);
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 400 });
    }

    if (!authorId || !practiceId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, user } = await requireAuthorPromotionMutationAccess(authorId);

    const { data: practice, error: practiceError } = await supabase
      .from("practices")
      .select("id, author_id, status")
      .eq("id", practiceId)
      .maybeSingle();

    if (practiceError) {
      console.error("promotion_practice_lookup_error", practiceError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!practice?.id || practice.author_id !== authorId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (practice.status !== "published") {
      return NextResponse.json({ error: "practice_not_published" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("promotion_campaigns")
      .insert({
        author_id: authorId,
        practice_id: practiceId,
        name,
        campaign_key: campaignKey,
        status: "active",
        created_by: user.id,
      })
      .select(
        `
        id,
        author_id,
        practice_id,
        name,
        campaign_key,
        status,
        created_by,
        created_at,
        updated_at,
        practices (
          title,
          slug,
          status,
          authors!practices_author_id_fkey (
            slug
          )
        )
      `,
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "campaign_key_taken" }, { status: 409 });
      }

      console.error("promotion_campaign_create_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json(
      { campaign: mapPromotionCampaignRow(data as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function loadAuthorPromotionSummary(
  request: Request,
): Promise<NextResponse> {
  try {
    const authorId = parseAuthorId(request);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const url = new URL(request.url);
    const period = parsePromotionPeriod(url.searchParams.get("period"));
    const { dateFrom, dateTo } = getPromotionPeriodBounds(period);
    const { supabase } = await requireAuthorPromotionAccess(authorId);

    const { data, error } = await supabase.rpc("get_author_promotion_summary", {
      p_author_id: authorId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });

    if (error) {
      console.error("promotion_summary_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const campaigns: PromotionCampaignSummaryRow[] = (data ?? []).map(
      (row: Record<string, unknown>) => ({
        campaign_id: String(row.campaign_id),
        campaign_name: String(row.campaign_name),
        campaign_key: String(row.campaign_key),
        campaign_status: row.campaign_status === "archived" ? "archived" : "active",
        practice_id: String(row.practice_id),
        practice_title: String(row.practice_title),
        practice_slug: String(row.practice_slug),
        author_slug: String(row.author_slug),
        unique_views: Number(row.unique_views ?? 0),
        unique_play_starts: Number(row.unique_play_starts ?? 0),
        unique_registrations: Number(row.unique_registrations ?? 0),
        unique_saves: Number(row.unique_saves ?? 0),
        total_events: Number(row.total_events ?? 0),
      }),
    );

    return NextResponse.json({ period, campaigns });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
