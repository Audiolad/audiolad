import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendSupportRequestNotificationEmail } from "@/lib/email/send-support-request-notification-email";
import { sanitizeSupportSourceUrl } from "@/lib/help/source-url";
import type { SupportRequestCategory } from "@/lib/help/types";

export type CreateSupportRequestInput = {
  category: SupportRequestCategory;
  subject: string;
  message: string;
  contactName: string | null;
  contactEmail: string;
  userId: string | null;
  authorId: string | null;
  sourceUrlRaw: string | null;
};

export type CreateSupportRequestResult =
  | {
      ok: true;
      requestId: string;
      emailDelivered: boolean;
    }
  | {
      ok: false;
      code: "insert_failed" | "author_not_found";
    };

export async function createSupportRequest(input: {
  service: SupabaseClient;
  payload: CreateSupportRequestInput;
}): Promise<CreateSupportRequestResult> {
  const { service, payload } = input;
  const sourceUrl = sanitizeSupportSourceUrl(payload.sourceUrlRaw);

  if (payload.authorId) {
    const { data: author, error: authorError } = await service
      .from("authors")
      .select("id")
      .eq("id", payload.authorId)
      .maybeSingle();

    if (authorError) {
      console.error("support_request_author_lookup_failed", authorError.message);
      return { ok: false, code: "insert_failed" };
    }

    if (!author?.id) {
      return { ok: false, code: "author_not_found" };
    }
  }

  const { data, error } = await service
    .from("support_requests")
    .insert({
      user_id: payload.userId,
      author_id: payload.authorId,
      category: payload.category,
      subject: payload.subject,
      message: payload.message,
      contact_name: payload.contactName,
      contact_email: payload.contactEmail,
      source_url: sourceUrl,
      status: "new",
    })
    .select("id, created_at")
    .single();

  if (error || !data?.id) {
    console.error("support_request_insert_failed", error?.message ?? "missing_id");
    return { ok: false, code: "insert_failed" };
  }

  const emailResult = await sendSupportRequestNotificationEmail({
    requestId: data.id,
    category: payload.category,
    subject: payload.subject,
    message: payload.message,
    contactName: payload.contactName,
    contactEmail: payload.contactEmail,
    userId: payload.userId,
    authorId: payload.authorId,
    sourceUrl,
    createdAt: data.created_at ?? new Date().toISOString(),
  });

  if (!emailResult.ok) {
    console.error(
      "support_request_email_failed_after_insert",
      data.id,
      emailResult.code,
    );
  }

  return {
    ok: true,
    requestId: data.id,
    emailDelivered: emailResult.ok,
  };
}
