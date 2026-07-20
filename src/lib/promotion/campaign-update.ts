import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildCampaignKeyFromName,
  normalizeCampaignKey,
  validateCampaignKey,
  validateCampaignName,
} from "@/lib/promotion/campaign-key";
import { mapPromotionCampaignRow } from "@/lib/promotion/campaigns-api";
import type { PromotionCampaignWithProduct } from "@/lib/promotion/types";

const CAMPAIGN_SELECT = `
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
`;

export type CampaignUpdateInput = {
  name?: string;
  practice_id?: string;
  campaign_key?: string;
  status?: "active" | "archived";
};

export async function campaignHasPromoActivity(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_promotion_campaign_stats", {
    p_campaign_id: campaignId,
    p_date_from: null,
    p_date_to: null,
  });

  if (error) {
    console.error("promotion_campaign_activity_check_error", error.message);
    throw new Error("internal_error");
  }

  return (data ?? []).some(
    (row: { event_count?: number | null }) => Number(row.event_count ?? 0) > 0,
  );
}

function parseCampaignUpdateInput(body: Record<string, unknown>): CampaignUpdateInput {
  const input: CampaignUpdateInput = {};

  if ("name" in body && typeof body.name === "string") {
    input.name = body.name.trim();
  }

  if ("practice_id" in body && typeof body.practice_id === "string") {
    input.practice_id = body.practice_id.trim();
  }

  if ("campaign_key" in body && typeof body.campaign_key === "string") {
    input.campaign_key = body.campaign_key;
  }

  if ("status" in body && typeof body.status === "string") {
    const status = body.status.trim();
    if (status === "active" || status === "archived") {
      input.status = status;
    }
  }

  return input;
}

export async function updatePromotionCampaign(
  supabase: SupabaseClient,
  campaign: PromotionCampaignWithProduct,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; campaign: PromotionCampaignWithProduct }
  | { ok: false; error: string; status: number }
> {
  const input = parseCampaignUpdateInput(body);
  const hasFieldUpdates =
    input.name !== undefined ||
    input.practice_id !== undefined ||
    input.campaign_key !== undefined;
  const hasStatusUpdate = input.status !== undefined;

  if (!hasFieldUpdates && !hasStatusUpdate) {
    return { ok: false, error: "invalid_request", status: 400 };
  }

  const updates: Record<string, string> = {};

  if (hasStatusUpdate && input.status) {
    updates.status = input.status;
  }

  if (hasFieldUpdates) {
    const name = input.name ?? campaign.name;
    const nameError = validateCampaignName(name);
    if (nameError) {
      return { ok: false, error: nameError, status: 400 };
    }

    const rawCampaignKey =
      input.campaign_key ??
      (input.name !== undefined && input.name !== campaign.name
        ? buildCampaignKeyFromName(name)
        : campaign.campaign_key);
    const campaignKey = normalizeCampaignKey(rawCampaignKey);
    const keyError = validateCampaignKey(campaignKey);
    if (keyError) {
      return { ok: false, error: keyError, status: 400 };
    }

    const practiceId = input.practice_id ?? campaign.practice_id;
    if (!practiceId) {
      return { ok: false, error: "invalid_request", status: 400 };
    }

    if (practiceId !== campaign.practice_id) {
      const hasActivity = await campaignHasPromoActivity(supabase, campaign.id);
      if (hasActivity) {
        return { ok: false, error: "campaign_practice_locked", status: 409 };
      }

      const { data: practice, error: practiceError } = await supabase
        .from("practices")
        .select("id, author_id, status")
        .eq("id", practiceId)
        .maybeSingle();

      if (practiceError) {
        console.error("promotion_practice_lookup_error", practiceError.message);
        return { ok: false, error: "internal_error", status: 500 };
      }

      if (!practice?.id || practice.author_id !== campaign.author_id) {
        return { ok: false, error: "forbidden", status: 403 };
      }

      if (practice.status !== "published") {
        return { ok: false, error: "practice_not_published", status: 400 };
      }
    }

    updates.name = name;
    updates.practice_id = practiceId;
    updates.campaign_key = campaignKey;
  }

  const { data, error } = await supabase
    .from("promotion_campaigns")
    .update(updates)
    .eq("id", campaign.id)
    .select(CAMPAIGN_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "campaign_key_taken", status: 409 };
    }

    console.error("promotion_campaign_update_error", error.message);
    return { ok: false, error: "internal_error", status: 500 };
  }

  return {
    ok: true,
    campaign: mapPromotionCampaignRow(data as Record<string, unknown>),
  };
}

export async function deletePromotionCampaign(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { error } = await supabase.rpc("delete_promotion_campaign_if_allowed", {
    p_campaign_id: campaignId,
  });

  if (error) {
    const message = error.message ?? "";

    if (message.includes("campaign_has_stats")) {
      return { ok: false, error: "campaign_has_stats", status: 409 };
    }

    if (message.includes("forbidden")) {
      return { ok: false, error: "forbidden", status: 403 };
    }

    if (message.includes("campaign_not_found")) {
      return { ok: false, error: "not_found", status: 404 };
    }

    console.error("promotion_campaign_delete_error", error.message);
    return { ok: false, error: "internal_error", status: 500 };
  }

  return { ok: true };
}
