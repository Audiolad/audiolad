import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  sendPartnerAuthorActivatedEmail,
  type SendPartnerAuthorActivatedEmailInput,
  type SendPartnerAuthorActivatedEmailResult,
} from "./send-partner-author-activated-email";

const MAX_ATTEMPTS = 5;

const PAYLOAD_KEYS = [
  "partner_name",
  "invitee_author_name",
  "activated_at",
  "expires_at",
] as const;

type OutboxRow = {
  id: string;
  referral_id: string;
  recipient_email: string;
  payload: Record<string, unknown>;
  lease_token: string;
};

type ActivationPayload = {
  partner_name: string;
  invitee_author_name: string;
  activated_at: string;
  expires_at: string;
};

export type PartnerActivationEmailSender = (
  input: SendPartnerAuthorActivatedEmailInput,
) => Promise<SendPartnerAuthorActivatedEmailResult>;

export function isPartnerActivationEmailPayload(
  value: Record<string, unknown>,
): value is ActivationPayload {
  const keys = Object.keys(value);
  if (keys.length !== PAYLOAD_KEYS.length) return false;
  if (!PAYLOAD_KEYS.every((key) => keys.includes(key))) return false;
  if (
    keys.some((key) =>
      /email|user_id|token/i.test(key),
    )
  ) {
    return false;
  }

  const partnerName = value.partner_name;
  const inviteeName = value.invitee_author_name;
  const activatedAt = value.activated_at;
  const expiresAt = value.expires_at;
  if (
    typeof partnerName !== "string" ||
    typeof inviteeName !== "string" ||
    typeof activatedAt !== "string" ||
    typeof expiresAt !== "string"
  ) {
    return false;
  }
  if (partnerName.includes("@") || inviteeName.includes("@")) return false;
  if (Number.isNaN(new Date(activatedAt).getTime())) return false;
  if (Number.isNaN(new Date(expiresAt).getTime())) return false;
  return true;
}

export async function processAuthorPartnerActivationEmailOutbox(options?: {
  limit?: number;
  supabase?: SupabaseClient;
  send?: PartnerActivationEmailSender;
}): Promise<{ claimed: number; sent: number; failed: number }> {
  const supabase = options?.supabase ?? createServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "claim_author_partner_activation_email_outbox",
    {
      p_limit: options?.limit ?? 10,
      p_lease_seconds: 300,
    },
  );

  if (error) {
    throw new Error(
      `author_partner_activation_email_outbox_claim_failed:${error.message}`,
    );
  }

  const rows = (data ?? []) as OutboxRow[];
  const send = options?.send ?? sendPartnerAuthorActivatedEmail;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const payload = row.payload;
    if (!row.lease_token || !row.referral_id || !isPartnerActivationEmailPayload(payload)) {
      await supabase.rpc("fail_author_partner_activation_email_outbox", {
        p_id: row.id,
        p_lease_token: row.lease_token,
        p_error: "invalid_outbox_payload",
        p_max_attempts: MAX_ATTEMPTS,
      });
      failed += 1;
      continue;
    }

    const result = await send({
      referralId: row.referral_id,
      toEmail: row.recipient_email,
      partnerName: payload.partner_name,
      inviteeAuthorName: payload.invitee_author_name,
      activatedAt: payload.activated_at,
      expiresAt: payload.expires_at,
    });

    if (result.ok) {
      const { data: completed, error: completeError } = await supabase.rpc(
        "complete_author_partner_activation_email_outbox",
        { p_id: row.id, p_lease_token: row.lease_token },
      );
      if (completeError || completed !== true) {
        throw new Error(
          `author_partner_activation_email_outbox_complete_failed:${completeError?.message ?? "lease_lost"}`,
        );
      }
      sent += 1;
      continue;
    }

    await supabase.rpc("fail_author_partner_activation_email_outbox", {
      p_id: row.id,
      p_lease_token: row.lease_token,
      p_error: result.code,
      p_max_attempts: MAX_ATTEMPTS,
    });
    failed += 1;
  }

  return { claimed: rows.length, sent, failed };
}
