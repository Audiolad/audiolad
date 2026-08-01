import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isAuthorProductModerationEmailContext,
  isAuthorProductModerationOutboxAction,
} from "@/lib/email/author-product-moderation-context";
import {
  notifyAuthorProductModeration,
  type NotifyAuthorProductModerationInput,
} from "@/lib/email/notify-author-product-moderation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type OutboxRow = {
  event_id: string;
  action: string;
  recipient_email: string | null;
  context: Record<string, unknown>;
  claim_token: string;
};

export type AuthorProductModerationEmailSender = (
  input: NotifyAuthorProductModerationInput,
) => ReturnType<typeof notifyAuthorProductModeration>;

export async function processAuthorProductModerationEmailOutbox(options?: {
  limit?: number;
  supabase?: SupabaseClient;
  send?: AuthorProductModerationEmailSender;
}): Promise<{ claimed: number; sent: number; failed: number }> {
  const supabase = options?.supabase ?? createServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "claim_practice_moderation_email_outbox",
    {
      p_limit: options?.limit ?? 10,
      p_lease_seconds: 300,
    },
  );

  if (error) {
    throw new Error(
      `practice_moderation_email_outbox_claim_failed:${error.message}`,
    );
  }

  const rows = (data ?? []) as OutboxRow[];
  const send = options?.send ?? notifyAuthorProductModeration;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const isValidRow =
      Boolean(row.claim_token) &&
      Boolean(row.recipient_email) &&
      isAuthorProductModerationOutboxAction(row.action) &&
      isAuthorProductModerationEmailContext(row.context);

    if (!isValidRow) {
      await supabase.rpc("complete_practice_moderation_email_outbox", {
        p_event_id: row.event_id,
        p_claim_token: row.claim_token,
        p_outcome: "failed",
        p_error_code: "invalid_outbox_row",
        p_error_message: "Missing recipient email or invalid context payload.",
      });
      failed += 1;
      continue;
    }

    const context = row.context as unknown as {
      product_title: string | null;
      author_dashboard_path: string;
      public_product_path: string | null;
      moderator_comment: string | null;
    };

    const result = await send({
      eventId: row.event_id,
      action: row.action as NotifyAuthorProductModerationInput["action"],
      toEmail: row.recipient_email as string,
      authorName: null,
      productTitle: context.product_title ?? "",
      authorDashboardPath: context.author_dashboard_path,
      publicProductPath: context.public_product_path,
      moderatorComment: context.moderator_comment,
    });

    if (result.ok) {
      const { data: completed, error: completeError } = await supabase.rpc(
        "complete_practice_moderation_email_outbox",
        {
          p_event_id: row.event_id,
          p_claim_token: row.claim_token,
          p_outcome: "sent",
        },
      );
      if (completeError || completed !== true) {
        throw new Error(
          `practice_moderation_email_outbox_complete_failed:${completeError?.message ?? "lease_lost"}`,
        );
      }
      sent += 1;
      continue;
    }

    await supabase.rpc("complete_practice_moderation_email_outbox", {
      p_event_id: row.event_id,
      p_claim_token: row.claim_token,
      p_outcome: "failed",
      p_error_code: result.code,
      p_error_message: null,
    });
    failed += 1;
  }

  return { claimed: rows.length, sent, failed };
}
