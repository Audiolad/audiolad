import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const OPERATIONAL_EMAIL_DELIVERY_STATUSES = [
  "pending",
  "sent",
  "failed",
] as const;

export type OperationalEmailDeliveryStatus =
  (typeof OPERATIONAL_EMAIL_DELIVERY_STATUSES)[number];

export type OperationalEmailDeliveryRow = {
  id: string;
  dedup_key: string;
  message_type: string;
  application_id: string | null;
  recipient_email: string;
  status: OperationalEmailDeliveryStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export const AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE = "author_access_granted";

export function buildAuthorAccessGrantedDedupKey(applicationId: string): string {
  return `author_access_granted:${applicationId.trim()}`;
}

export type AcquireOperationalEmailDeliveryInput = {
  applicationId: string;
  recipientEmail: string;
  messageType?: string;
  forceResend?: boolean;
};

export type AcquireOperationalEmailDeliveryResult =
  | {
      ok: true;
      delivery: OperationalEmailDeliveryRow;
      shouldSend: true;
    }
  | {
      ok: true;
      delivery: OperationalEmailDeliveryRow;
      shouldSend: false;
      reason: "already_sent" | "dedup_blocked";
    }
  | { ok: false; code: "invalid_input" | "delivery_persist_failed" };

function getServiceClient(supabase?: SupabaseClient): SupabaseClient {
  return supabase ?? createServiceRoleClient();
}

export async function acquireOperationalEmailDelivery(
  input: AcquireOperationalEmailDeliveryInput,
  supabase?: SupabaseClient,
): Promise<AcquireOperationalEmailDeliveryResult> {
  const applicationId = input.applicationId.trim();
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const messageType = input.messageType?.trim() || AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE;
  const dedupKey = buildAuthorAccessGrantedDedupKey(applicationId);

  if (!applicationId || !recipientEmail) {
    return { ok: false, code: "invalid_input" };
  }

  const client = getServiceClient(supabase);

  const { data: existing, error: loadError } = await client
    .from("operational_email_deliveries")
    .select("*")
    .eq("dedup_key", dedupKey)
    .maybeSingle();

  if (loadError) {
    console.error("operational_email_delivery_load_error", loadError.message);
    return { ok: false, code: "delivery_persist_failed" };
  }

  if (existing?.status === "sent" && !input.forceResend) {
    return {
      ok: true,
      delivery: existing as OperationalEmailDeliveryRow,
      shouldSend: false,
      reason: "already_sent",
    };
  }

  if (!existing) {
    const { data: inserted, error: insertError } = await client
      .from("operational_email_deliveries")
      .insert({
        dedup_key: dedupKey,
        message_type: messageType,
        application_id: applicationId,
        recipient_email: recipientEmail,
        status: "pending",
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      console.error("operational_email_delivery_insert_error", insertError?.message);
      return { ok: false, code: "delivery_persist_failed" };
    }

    return {
      ok: true,
      delivery: inserted as OperationalEmailDeliveryRow,
      shouldSend: true,
    };
  }

  if (existing.status === "sent" && input.forceResend) {
    const { data: reset, error: resetError } = await client
      .from("operational_email_deliveries")
      .update({
        status: "pending",
        recipient_email: recipientEmail,
        last_error: null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (resetError || !reset) {
      console.error("operational_email_delivery_reset_error", resetError?.message);
      return { ok: false, code: "delivery_persist_failed" };
    }

    return {
      ok: true,
      delivery: reset as OperationalEmailDeliveryRow,
      shouldSend: true,
    };
  }

  const { data: updated, error: updateError } = await client
    .from("operational_email_deliveries")
    .update({
      recipient_email: recipientEmail,
      status: "pending",
    })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    console.error("operational_email_delivery_update_error", updateError?.message);
    return { ok: false, code: "delivery_persist_failed" };
  }

  return {
    ok: true,
    delivery: updated as OperationalEmailDeliveryRow,
    shouldSend: true,
  };
}

export async function markOperationalEmailDeliveryAttempt(
  deliveryId: string,
  supabase?: SupabaseClient,
): Promise<void> {
  const client = getServiceClient(supabase);
  const { data: row } = await client
    .from("operational_email_deliveries")
    .select("attempt_count")
    .eq("id", deliveryId)
    .maybeSingle();

  const attemptCount =
    typeof row?.attempt_count === "number" ? row.attempt_count + 1 : 1;

  await client
    .from("operational_email_deliveries")
    .update({
      attempt_count: attemptCount,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
}

export async function markOperationalEmailDeliverySent(
  deliveryId: string,
  supabase?: SupabaseClient,
): Promise<void> {
  const client = getServiceClient(supabase);
  const now = new Date().toISOString();

  await client
    .from("operational_email_deliveries")
    .update({
      status: "sent",
      sent_at: now,
      last_error: null,
    })
    .eq("id", deliveryId);
}

export async function markOperationalEmailDeliveryFailed(
  deliveryId: string,
  errorMessage: string,
  supabase?: SupabaseClient,
): Promise<void> {
  const client = getServiceClient(supabase);
  const trimmed = errorMessage.trim().slice(0, 2000) || "send_failed";

  await client
    .from("operational_email_deliveries")
    .update({
      status: "failed",
      last_error: trimmed,
    })
    .eq("id", deliveryId);
}

export async function getOperationalEmailDeliveryForApplication(
  applicationId: string,
  messageType: string = AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE,
  supabase?: SupabaseClient,
): Promise<OperationalEmailDeliveryRow | null> {
  const client = getServiceClient(supabase);
  const dedupKey = buildAuthorAccessGrantedDedupKey(applicationId);

  const { data, error } = await client
    .from("operational_email_deliveries")
    .select("*")
    .eq("dedup_key", dedupKey)
    .eq("message_type", messageType)
    .maybeSingle();

  if (error) {
    console.error("operational_email_delivery_lookup_error", error.message);
    return null;
  }

  return (data as OperationalEmailDeliveryRow | null) ?? null;
}
