import {
  BUSINESS_ACCESS_REMINDER_KINDS,
  type BusinessAccessReminderKind,
} from "@/lib/business/access-reminders";

import type {
  SendBusinessAccessReminderEmailInput,
  SendBusinessAccessReminderEmailResult,
} from "@/lib/email/send-business-access-reminder-email";

export type BusinessAccessReminderClaimRow = {
  send_id: string;
  user_id: string;
  period_end: string;
  reminder_kind: string;
  recipient_email: string | null;
  lease_token: string;
};

export type BusinessAccessReminderSender = (
  input: SendBusinessAccessReminderEmailInput,
) => Promise<SendBusinessAccessReminderEmailResult>;

export type BusinessAccessReminderRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type ProcessBusinessAccessRemindersResult = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
};

function isKind(value: string): value is BusinessAccessReminderKind {
  return (BUSINESS_ACCESS_REMINDER_KINDS as readonly string[]).includes(value);
}

function normalizeClaimRows(data: unknown): BusinessAccessReminderClaimRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is BusinessAccessReminderClaimRow => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.send_id === "string" &&
      typeof record.user_id === "string" &&
      typeof record.period_end === "string" &&
      typeof record.reminder_kind === "string" &&
      typeof record.lease_token === "string"
    );
  });
}

function recipientLooksDeliverable(email: string): boolean {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  return at > 0 && at === trimmed.lastIndexOf("@") && at < trimmed.length - 1;
}

async function defaultSupabase(): Promise<BusinessAccessReminderRpcClient> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  return createServiceRoleClient() as unknown as BusinessAccessReminderRpcClient;
}

async function defaultSend(
  input: SendBusinessAccessReminderEmailInput,
): Promise<SendBusinessAccessReminderEmailResult> {
  const { sendBusinessAccessReminderEmail } = await import(
    "@/lib/email/send-business-access-reminder-email"
  );
  return sendBusinessAccessReminderEmail(input);
}

export async function processBusinessAccessReminders(options?: {
  limit?: number;
  leaseSeconds?: number;
  supabase?: BusinessAccessReminderRpcClient;
  send?: BusinessAccessReminderSender;
}): Promise<ProcessBusinessAccessRemindersResult> {
  const supabase = options?.supabase ?? (await defaultSupabase());
  const { data, error } = await supabase.rpc("claim_business_access_reminders", {
    p_limit: options?.limit ?? 25,
    p_lease_seconds: options?.leaseSeconds ?? 300,
  });

  if (error) {
    throw new Error(`business_access_reminder_claim_failed:${error.message}`);
  }

  const rows = normalizeClaimRows(data);
  const send = options?.send ?? defaultSend;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const email = row.recipient_email?.trim() ?? "";
    const kind = row.reminder_kind;
    if (!isKind(kind) || !recipientLooksDeliverable(email)) {
      console.error(
        JSON.stringify({
          event: "business_access_reminder_recipient_missing",
          sendId: row.send_id,
          userId: row.user_id,
          kind,
        }),
      );
      await supabase.rpc("fail_business_access_reminder", {
        p_send_id: row.send_id,
        p_lease_token: row.lease_token,
        p_permanent: true,
      });
      skipped += 1;
      continue;
    }

    const result = await send({
      toEmail: email,
      kind,
      periodEnd: row.period_end,
      sendId: row.send_id,
    });

    if (result.ok) {
      const { error: completeError } = await supabase.rpc("complete_business_access_reminder", {
        p_send_id: row.send_id,
        p_lease_token: row.lease_token,
      });
      if (completeError) {
        console.error(
          JSON.stringify({
            event: "business_access_reminder_complete_failed",
            sendId: row.send_id,
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
        event: "business_access_reminder_send_error",
        sendId: row.send_id,
        code: result.code,
      }),
    );

    await supabase.rpc("fail_business_access_reminder", {
      p_send_id: row.send_id,
      p_lease_token: row.lease_token,
      p_permanent: result.code === "invalid_input",
    });
    if (result.code === "invalid_input") skipped += 1;
    else failed += 1;
  }

  return { claimed: rows.length, sent, skipped, failed };
}
