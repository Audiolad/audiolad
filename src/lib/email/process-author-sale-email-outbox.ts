import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sendAuthorProductSoldEmail,
  type SendAuthorProductSoldEmailInput,
} from "@/lib/email/send-author-product-sold-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: string;
  sale_id: string;
  recipient_email: string;
  payload: Record<string, unknown>;
  lease_token: string;
};

type SaleEmailPayload = {
  author_name: string | null;
  product_title: string;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
  paid_at: string;
  amount_minor: number;
  author_amount_minor: number | null;
  author_amount_pending: boolean;
};

function isPayload(value: Record<string, unknown>): value is SaleEmailPayload {
  return (
    typeof value.product_title === "string" &&
    typeof value.paid_at === "string" &&
    typeof value.amount_minor === "number" &&
    typeof value.author_amount_pending === "boolean"
  );
}

export type AuthorSaleEmailSender = (
  input: SendAuthorProductSoldEmailInput,
) => ReturnType<typeof sendAuthorProductSoldEmail>;

export async function processAuthorSaleEmailOutbox(options?: {
  limit?: number;
  supabase?: SupabaseClient;
  send?: AuthorSaleEmailSender;
}): Promise<{ claimed: number; sent: number; failed: number }> {
  const supabase = options?.supabase ?? createServiceRoleClient();
  const { data, error } = await supabase.rpc("claim_author_sale_email_outbox", {
    p_limit: options?.limit ?? 10,
    p_lease_seconds: 300,
  });

  if (error) {
    throw new Error(`author_sale_email_outbox_claim_failed:${error.message}`);
  }

  const rows = (data ?? []) as OutboxRow[];
  const send = options?.send ?? sendAuthorProductSoldEmail;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const payload = row.payload;
    if (!row.lease_token || !isPayload(payload)) {
      await supabase.rpc("fail_author_sale_email_outbox", {
        p_id: row.id,
        p_lease_token: row.lease_token,
        p_error: "invalid_outbox_payload",
        p_max_attempts: MAX_ATTEMPTS,
      });
      failed += 1;
      continue;
    }

    const result = await send({
      saleId: row.sale_id,
      toEmail: row.recipient_email,
      authorName: payload.author_name,
      productTitle: payload.product_title,
      buyerFirstName: payload.buyer_first_name,
      buyerLastName: payload.buyer_last_name,
      paidAt: payload.paid_at,
      amountMinor: payload.amount_minor,
      authorAmountMinor: payload.author_amount_minor,
      authorAmountPending: payload.author_amount_pending,
    });

    if (result.ok) {
      const { data: completed, error: completeError } = await supabase.rpc(
        "complete_author_sale_email_outbox",
        { p_id: row.id, p_lease_token: row.lease_token },
      );
      if (completeError || completed !== true) {
        throw new Error(
          `author_sale_email_outbox_complete_failed:${completeError?.message ?? "lease_lost"}`,
        );
      }
      sent += 1;
      continue;
    }

    await supabase.rpc("fail_author_sale_email_outbox", {
      p_id: row.id,
      p_lease_token: row.lease_token,
      p_error: result.code,
      p_max_attempts: MAX_ATTEMPTS,
    });
    failed += 1;
  }

  return { claimed: rows.length, sent, failed };
}
