import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { businessTrialActivityConfig, type BusinessStartHost } from "./config";

/**
 * Best-effort writers for gift-week activity. Every call is a no-op while
 * AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_ENABLED is not "1", and never throws:
 * stats must not break playback, the cabinet or the guest start.
 */
function config() {
  return businessTrialActivityConfig(process.env);
}

function warn(code: string) {
  console.warn(code);
}

async function organizationForLocation(locationId: string): Promise<string | null> {
  const { data, error } = await createServiceRoleClient()
    .from("business_locations")
    .select("organization_id")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw error;
  const id = (data as { organization_id?: unknown } | null)?.organization_id;
  return typeof id === "string" ? id : null;
}

async function recordForLocation(locationId: string, kind: "listen" | "visit"): Promise<void> {
  const cfg = config();
  if (!cfg.enabled) return;
  try {
    const organizationId = await organizationForLocation(locationId);
    if (!organizationId) return;
    const { error } = await createServiceRoleClient().rpc("record_business_trial_activity", {
      p_organization_id: organizationId,
      p_kind: kind,
      p_max_step_seconds: cfg.maxStepSeconds,
      p_visit_gap_seconds: cfg.visitGapSeconds,
      p_retention_days: cfg.retentionDays,
    });
    if (error) warn("business_trial_activity_failed");
  } catch {
    warn("business_trial_activity_failed");
  }
}

/** Cabinet player saved its place while open (about every 15 s during playback). */
export function recordBusinessTrialListen(locationId: string): Promise<void> {
  return recordForLocation(locationId, "listen");
}

/** Owner opened the cabinet home. */
export function recordBusinessTrialVisit(locationId: string): Promise<void> {
  return recordForLocation(locationId, "visit");
}

/** Paired point device confirmed real playback. The token is already validated by the point RPC. */
export async function recordBusinessTrialPointListen(token: string): Promise<void> {
  const cfg = config();
  if (!cfg.enabled) return;
  try {
    const { error } = await createServiceRoleClient().rpc("record_business_trial_point_listen", {
      p_token: token,
      p_max_step_seconds: cfg.maxStepSeconds,
      p_retention_days: cfg.retentionDays,
    });
    if (error) warn("business_trial_activity_failed");
  } catch {
    warn("business_trial_activity_failed");
  }
}

/** Which host a guest started the gift from. Written once, never overwritten. */
export async function recordBusinessGuestStartHost(userId: string, host: BusinessStartHost | null): Promise<void> {
  if (!host || !config().enabled) return;
  try {
    const { error } = await createServiceRoleClient()
      .from("business_guest_starts")
      .update({ start_host: host })
      .eq("user_id", userId)
      .is("start_host", null);
    if (error) warn("business_trial_start_host_failed");
  } catch {
    warn("business_trial_start_host_failed");
  }
}
