import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveUtmMediumFromForm } from "./channel-types";
import type { PromotionCampaignChannel } from "./types";
import {
  isValidUtmMedium,
  isValidUtmSource,
  normalizeUtmValue,
} from "./utm-normalize";

export type CampaignChannelInput = {
  label: string;
  utm_source: string;
  utm_medium: string;
};

export type CampaignChannelMutationResult =
  | { ok: true; channel: PromotionCampaignChannel }
  | { ok: false; error: string; status: number };

function mapCampaignChannelRow(row: Record<string, unknown>): PromotionCampaignChannel {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    label: String(row.label),
    utm_source: String(row.utm_source),
    utm_medium: String(row.utm_medium),
    position: Number(row.position ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function validateCampaignChannelLabel(label: string): string | null {
  const trimmed = label.trim();

  if (!trimmed) {
    return "channel_label_required";
  }

  if (trimmed.length > 120) {
    return "channel_label_too_long";
  }

  return null;
}

export function normalizeCampaignChannelInput(input: CampaignChannelInput): {
  label: string;
  utm_source: string;
  utm_medium: string;
} | null {
  const label = input.label.trim();
  const utm_source = normalizeUtmValue(input.utm_source);
  const utm_medium = input.utm_medium.trim().toLowerCase();

  if (!label || !utm_source || !utm_medium) {
    return null;
  }

  return { label, utm_source, utm_medium };
}

export function validateCampaignChannelInput(input: CampaignChannelInput): string | null {
  const labelError = validateCampaignChannelLabel(input.label);
  if (labelError) {
    return labelError;
  }

  const normalized = normalizeCampaignChannelInput(input);
  if (!normalized) {
    return "channel_utm_invalid";
  }

  if (!isValidUtmSource(normalized.utm_source)) {
    return "channel_source_invalid";
  }

  if (!isValidUtmMedium(normalized.utm_medium)) {
    return "channel_medium_invalid";
  }

  return null;
}

export function parseCampaignChannelBody(body: unknown): CampaignChannelInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const label =
    "label" in body && typeof body.label === "string" ? body.label : "";
  const utmSource =
    "utm_source" in body && typeof body.utm_source === "string"
      ? body.utm_source
      : "";
  const utmMedium =
    "utm_medium" in body && typeof body.utm_medium === "string"
      ? body.utm_medium
      : "";

  if (!label || !utmSource || !utmMedium) {
    return null;
  }

  return {
    label,
    utm_source: utmSource,
    utm_medium: utmMedium,
  };
}

export function parseCampaignChannelFormBody(body: unknown): CampaignChannelInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const label =
    "label" in body && typeof body.label === "string" ? body.label : "";
  const utmSource =
    "utm_source" in body && typeof body.utm_source === "string"
      ? body.utm_source
      : "";
  const channelType =
    "channel_type" in body && typeof body.channel_type === "string"
      ? body.channel_type
      : "";
  const customTypeLabel =
    "custom_type_label" in body && typeof body.custom_type_label === "string"
      ? body.custom_type_label
      : "";

  if (!label || !utmSource || !channelType) {
    return null;
  }

  const utm_medium = resolveUtmMediumFromForm(channelType, customTypeLabel);
  if (!utm_medium) {
    return null;
  }

  return {
    label,
    utm_source: utmSource,
    utm_medium,
  };
}

export async function listCampaignChannels(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<PromotionCampaignChannel[]> {
  const { data, error } = await supabase
    .from("promotion_campaign_channels")
    .select(
      "id, campaign_id, label, utm_source, utm_medium, position, created_at, updated_at",
    )
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("promotion_campaign_channels_list_error", error.message);
    throw new Error("internal_error");
  }

  return (data ?? []).map((row) =>
    mapCampaignChannelRow(row as Record<string, unknown>),
  );
}

async function nextCampaignChannelPosition(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("promotion_campaign_channels")
    .select("position")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: false })
    .limit(1);

  if (error) {
    console.error("promotion_campaign_channels_position_error", error.message);
    throw new Error("internal_error");
  }

  const current = data?.[0]?.position;
  return typeof current === "number" ? current + 1 : 0;
}

export async function createCampaignChannel(
  supabase: SupabaseClient,
  campaignId: string,
  input: CampaignChannelInput,
): Promise<CampaignChannelMutationResult> {
  const validationError = validateCampaignChannelInput(input);
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  const normalized = normalizeCampaignChannelInput(input)!;
  const position = await nextCampaignChannelPosition(supabase, campaignId);

  const { data, error } = await supabase
    .from("promotion_campaign_channels")
    .insert({
      campaign_id: campaignId,
      label: normalized.label,
      utm_source: normalized.utm_source,
      utm_medium: normalized.utm_medium,
      position,
    })
    .select(
      "id, campaign_id, label, utm_source, utm_medium, position, created_at, updated_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "channel_utm_duplicate", status: 409 };
    }

    console.error("promotion_campaign_channels_create_error", error.message);
    return { ok: false, error: "internal_error", status: 500 };
  }

  return {
    ok: true,
    channel: mapCampaignChannelRow(data as Record<string, unknown>),
  };
}

export async function updateCampaignChannel(
  supabase: SupabaseClient,
  campaignId: string,
  channelId: string,
  input: CampaignChannelInput,
): Promise<CampaignChannelMutationResult> {
  const validationError = validateCampaignChannelInput(input);
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  const normalized = normalizeCampaignChannelInput(input)!;

  const { data, error } = await supabase
    .from("promotion_campaign_channels")
    .update({
      label: normalized.label,
      utm_source: normalized.utm_source,
      utm_medium: normalized.utm_medium,
    })
    .eq("id", channelId)
    .eq("campaign_id", campaignId)
    .select(
      "id, campaign_id, label, utm_source, utm_medium, position, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "channel_utm_duplicate", status: 409 };
    }

    console.error("promotion_campaign_channels_update_error", error.message);
    return { ok: false, error: "internal_error", status: 500 };
  }

  if (!data) {
    return { ok: false, error: "not_found", status: 404 };
  }

  return {
    ok: true,
    channel: mapCampaignChannelRow(data as Record<string, unknown>),
  };
}

export async function deleteCampaignChannel(
  supabase: SupabaseClient,
  campaignId: string,
  channelId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await supabase
    .from("promotion_campaign_channels")
    .delete()
    .eq("id", channelId)
    .eq("campaign_id", campaignId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("promotion_campaign_channels_delete_error", error.message);
    return { ok: false, error: "internal_error", status: 500 };
  }

  if (!data) {
    return { ok: false, error: "not_found", status: 404 };
  }

  return { ok: true };
}

export { mapCampaignChannelRow };
