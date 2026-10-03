"use server";

import { redirect } from "next/navigation";

import { confirmAuthorMarketingUnsubscribe } from "@/lib/email/confirm-unsubscribe";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function confirmUnsubscribeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = createServiceRoleClient();
  const result = await confirmAuthorMarketingUnsubscribe({
    token,
    secret: process.env.AUDIOLAD_EMAIL_UNSUBSCRIBE_SECRET,
    store: {
      async listSuppressions(normalizedEmail) {
        const { data, error } = await supabase
          .from("email_suppressions")
          .select("normalized_email, scope, reason, expires_at")
          .eq("normalized_email", normalizedEmail)
          .limit(50);
        if (error) {
          throw new Error("email_suppression_lookup_failed");
        }
        return (data ?? []).map((row) => ({
          normalizedEmail: String(row.normalized_email),
          scope: String(row.scope),
          reason: String(row.reason),
          expiresAt: row.expires_at ? String(row.expires_at) : null,
        }));
      },
      async insertSuppression(input) {
        const { error } = await supabase.from("email_suppressions").insert({
          normalized_email: input.normalizedEmail,
          scope: input.scope,
          reason: input.reason,
          source: input.source,
        });
        if (error && error.code !== "23505") {
          throw new Error("email_suppression_insert_failed");
        }
      },
      async revokeAuthorMarketing(normalizedEmail) {
        const { data: contacts, error } = await supabase
          .from("email_contacts")
          .select("id, user_id")
          .eq("normalized_email", normalizedEmail)
          .eq("status", "active");
        if (error) {
          throw new Error("email_contact_lookup_failed");
        }
        for (const contact of contacts ?? []) {
          if (contact.user_id) {
            await supabase
              .from("email_preferences")
              .update({ author_marketing: false, updated_at: new Date().toISOString() })
              .eq("user_id", contact.user_id);
          }
          await supabase.from("email_consents").insert({
            contact_id: contact.id,
            user_id: contact.user_id,
            purpose: "author_marketing",
            status: "revoked",
            legal_basis: "consent",
            text_version: "author-marketing-unsubscribe-v1",
            source: "user_unsubscribe",
            revoked_at: new Date().toISOString(),
          });
        }
      },
    },
  });

  if (!result.ok) {
    redirect("/email/unsubscribe?status=invalid");
  }

  redirect(result.already ? "/email/unsubscribe?status=already" : "/email/unsubscribe?status=ok");
}
