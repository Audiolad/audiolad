import type {
  SendSeoReservation5dReminderEmailInput,
  SendSeoReservation5dReminderEmailResult,
} from "@/lib/email/send-seo-reservation-5d-reminder-email";
import { isValidReminderRecipientEmail } from "@/lib/seo-queries/reservation-5d-reminder";

export type SeoReservation5dReminderClaimRow = {
  reservation_id: string;
  author_id: string;
  query_id: string;
  query_text: string;
  expires_at: string | null;
  reserved_at: string;
  recipient_email: string | null;
  lease_token: string;
};

export type SeoReservation5dReminderSender = (
  input: SendSeoReservation5dReminderEmailInput,
) => Promise<SendSeoReservation5dReminderEmailResult>;

export type SeoReservation5dReminderRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type ProcessSeoReservation5dRemindersResult = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
};

function normalizeClaimRows(data: unknown): SeoReservation5dReminderClaimRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is SeoReservation5dReminderClaimRow => {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    return (
      typeof r.reservation_id === "string" &&
      typeof r.lease_token === "string" &&
      typeof r.query_text === "string"
    );
  });
}

async function defaultSupabase(): Promise<SeoReservation5dReminderRpcClient> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  return createServiceRoleClient() as unknown as SeoReservation5dReminderRpcClient;
}

async function defaultSend(
  input: SendSeoReservation5dReminderEmailInput,
): Promise<SendSeoReservation5dReminderEmailResult> {
  const { sendSeoReservation5dReminderEmail } = await import(
    "@/lib/email/send-seo-reservation-5d-reminder-email"
  );
  return sendSeoReservation5dReminderEmail(input);
}

export async function processSeoReservation5dReminders(options?: {
  limit?: number;
  leaseSeconds?: number;
  supabase?: SeoReservation5dReminderRpcClient;
  send?: SeoReservation5dReminderSender;
}): Promise<ProcessSeoReservation5dRemindersResult> {
  const supabase = options?.supabase ?? (await defaultSupabase());
  const { data, error } = await supabase.rpc("claim_seo_reservation_5d_reminders", {
    p_limit: options?.limit ?? 25,
    p_lease_seconds: options?.leaseSeconds ?? 300,
  });

  if (error) {
    throw new Error(`seo_reservation_5d_reminder_claim_failed:${error.message}`);
  }

  const rows = normalizeClaimRows(data);
  const send = options?.send ?? defaultSend;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const email = row.recipient_email?.trim().toLowerCase() ?? "";
    if (!isValidReminderRecipientEmail(email)) {
      console.error(
        JSON.stringify({
          event: "seo_reservation_5d_reminder_recipient_missing",
          reservationId: row.reservation_id,
          authorId: row.author_id,
        }),
      );
      await supabase.rpc("fail_seo_reservation_5d_reminder", {
        p_reservation_id: row.reservation_id,
        p_lease_token: row.lease_token,
        p_permanent: true,
      });
      skipped += 1;
      continue;
    }

    const result = await send({
      toEmail: email,
      queryText: row.query_text,
      expiresAt: row.expires_at,
      reservationId: row.reservation_id,
    });

    if (result.ok) {
      const { error: completeError } = await supabase.rpc(
        "complete_seo_reservation_5d_reminder",
        {
          p_reservation_id: row.reservation_id,
          p_lease_token: row.lease_token,
        },
      );
      if (completeError) {
        console.error(
          JSON.stringify({
            event: "seo_reservation_5d_reminder_complete_failed",
            reservationId: row.reservation_id,
            message: completeError.message,
          }),
        );
        failed += 1;
        continue;
      }
      sent += 1;
      continue;
    }

    console.error(
      JSON.stringify({
        event: "seo_reservation_5d_reminder_send_error",
        reservationId: row.reservation_id,
        code: result.code,
      }),
    );

    await supabase.rpc("fail_seo_reservation_5d_reminder", {
      p_reservation_id: row.reservation_id,
      p_lease_token: row.lease_token,
      p_permanent: false,
    });
    failed += 1;
  }

  return { claimed: rows.length, sent, skipped, failed };
}
