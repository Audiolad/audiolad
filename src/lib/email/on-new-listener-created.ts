import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildListenerWelcomeDedupKey,
  LISTENER_WELCOME_MESSAGE_TYPE,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
} from "@/lib/email/operational-deliveries";
import {
  sendWelcomeEmail,
  type SendWelcomeEmailResult,
} from "@/lib/email/send-welcome-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type OnNewListenerCreatedInput = {
  userId: string;
  email: string;
  firstName: string;
};

export type OnNewListenerCreatedResult =
  | { ok: true; status: "sent" }
  | { ok: true; status: "already_sent" }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "delivery_persist_failed"
        | "smtp_not_configured"
        | "template_render_failed"
        | "send_failed";
    };

export type OnNewListenerCreatedDeps = {
  sendWelcomeEmail?: (
    input: Parameters<typeof sendWelcomeEmail>[0],
  ) => Promise<SendWelcomeEmailResult>;
  createDeliveryClient?: () => SupabaseClient;
};

type ClaimResult =
  | { ok: true; status: "claimed"; deliveryId: string }
  | { ok: true; status: "already_sent" }
  | { ok: false; code: "delivery_persist_failed" };

async function claimListenerWelcomeDelivery(
  client: SupabaseClient,
  userId: string,
  recipientEmail: string,
): Promise<ClaimResult> {
  const dedupKey = buildListenerWelcomeDedupKey(userId);

  const { data: existing, error: loadError } = await client
    .from("operational_email_deliveries")
    .select("id")
    .eq("dedup_key", dedupKey)
    .maybeSingle();

  if (loadError) {
    console.error("listener_welcome_delivery_load_error", loadError.message);
    return { ok: false, code: "delivery_persist_failed" };
  }

  if (existing?.id) {
    return { ok: true, status: "already_sent" };
  }

  const { data: inserted, error: insertError } = await client
    .from("operational_email_deliveries")
    .insert({
      dedup_key: dedupKey,
      message_type: LISTENER_WELCOME_MESSAGE_TYPE,
      application_id: null,
      recipient_email: recipientEmail,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    if (insertError?.code === "23505") {
      return { ok: true, status: "already_sent" };
    }

    console.error(
      "listener_welcome_delivery_insert_error",
      insertError?.message,
    );
    return { ok: false, code: "delivery_persist_failed" };
  }

  return { ok: true, status: "claimed", deliveryId: inserted.id };
}

/**
 * Canonical one-shot welcome for a newly created listener.
 * Call only after a successful auth.signUp that produced a user id.
 * Login / verify / link / touch must not call this.
 */
export async function onNewListenerCreated(
  input: OnNewListenerCreatedInput,
  deps: OnNewListenerCreatedDeps = {},
): Promise<OnNewListenerCreatedResult> {
  try {
    const userId = input.userId.trim();
    const email = input.email.trim().toLowerCase();
    const firstName = input.firstName.trim();

    if (!userId || !email) {
      return { ok: false, code: "invalid_input" };
    }

    let client: SupabaseClient;
    try {
      client = (deps.createDeliveryClient ?? createServiceRoleClient)();
    } catch (error) {
      console.error(
        "listener_welcome_delivery_client_error",
        error instanceof Error ? error.message : "unknown",
      );
      return { ok: false, code: "delivery_persist_failed" };
    }

    const claimed = await claimListenerWelcomeDelivery(client, userId, email);

    if (!claimed.ok) {
      return claimed;
    }

    if (claimed.status === "already_sent") {
      return { ok: true, status: "already_sent" };
    }

    const send = deps.sendWelcomeEmail ?? sendWelcomeEmail;
    const welcomeResult = await send({
      toEmail: email,
      userName: firstName,
    });

    if (!welcomeResult.ok) {
      await markOperationalEmailDeliveryFailed(
        claimed.deliveryId,
        welcomeResult.code,
        client,
      );
      return { ok: false, code: welcomeResult.code };
    }

    await markOperationalEmailDeliverySent(claimed.deliveryId, client);
    return { ok: true, status: "sent" };
  } catch (error) {
    console.error(
      "listener_welcome_unhandled_error",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, code: "send_failed" };
  }
}
