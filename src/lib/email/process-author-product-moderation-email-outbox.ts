import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isAuthorProductModerationAdminEmailContext,
  isAuthorProductModerationAdminOutboxAction,
  isAuthorProductModerationAuthorOutboxAction,
  isAuthorProductModerationEmailContext,
  isAuthorProductModerationOutboxAction,
} from "@/lib/email/author-product-moderation-context";
import {
  notifyAuthorProductModeration,
  type NotifyAuthorProductModerationInput,
} from "@/lib/email/notify-author-product-moderation";
import {
  notifyAuthorProductModerationAdmin,
  type NotifyAuthorProductModerationAdminInput,
} from "@/lib/email/notify-author-product-moderation-admin";
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

export type AuthorProductModerationAdminEmailSender = (
  input: NotifyAuthorProductModerationAdminInput,
) => ReturnType<typeof notifyAuthorProductModerationAdmin>;

export async function processAuthorProductModerationEmailOutbox(options?: {
  limit?: number;
  supabase?: SupabaseClient;
  send?: AuthorProductModerationEmailSender;
  sendAdmin?: AuthorProductModerationAdminEmailSender;
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
  const sendAdmin = options?.sendAdmin ?? notifyAuthorProductModerationAdmin;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const isValidAction =
      Boolean(row.claim_token) &&
      Boolean(row.recipient_email) &&
      isAuthorProductModerationOutboxAction(row.action);

    if (!isValidAction) {
      await supabase.rpc("complete_practice_moderation_email_outbox", {
        p_event_id: row.event_id,
        p_claim_token: row.claim_token,
        p_outcome: "failed",
        p_error_code: "invalid_outbox_row",
        p_error_message: "Missing recipient email or invalid action.",
      });
      failed += 1;
      continue;
    }

    if (isAuthorProductModerationAdminOutboxAction(row.action)) {
      if (!isAuthorProductModerationAdminEmailContext(row.context)) {
        await supabase.rpc("complete_practice_moderation_email_outbox", {
          p_event_id: row.event_id,
          p_claim_token: row.claim_token,
          p_outcome: "failed",
          p_error_code: "invalid_outbox_row",
          p_error_message: "Missing or invalid admin context payload.",
        });
        failed += 1;
        continue;
      }

      const context = row.context;
      const result = await sendAdmin({
        eventId: row.event_id,
        action: row.action,
        toEmail: row.recipient_email as string,
        productId: context.product_id,
        productTitle: context.product_title ?? "",
        authorName: context.author_name ?? "",
        authorProjectName: context.author_project_name ?? "",
        productKindLabel: context.product_kind_label,
        priceLabel: context.price_label,
        audioTrackCount: context.audio_track_count,
        submissionKindLabel: context.submission_kind_label,
        submittedAt: context.submitted_at,
        adminReviewPath: context.admin_review_path,
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
      continue;
    }

    if (
      !isAuthorProductModerationAuthorOutboxAction(row.action) ||
      !isAuthorProductModerationEmailContext(row.context)
    ) {
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

    const context = row.context;
    const result = await send({
      eventId: row.event_id,
      action: row.action,
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
