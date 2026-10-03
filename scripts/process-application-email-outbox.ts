import { isApplicationSuppressionScope } from "@/lib/email/delivery-gate";
import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import { processApplicationEmailOutbox } from "@/lib/email/process-application-email-outbox";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { createSupabaseApplicationEmailRuntime } from "@/lib/email/supabase-application-email-runtime";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function main() {
  const delivery = resolveAuthorsEmailDeliveryFromEnv();
  if (!delivery.ok) {
    console.error("authors_smtp_not_configured");
    process.exitCode = 1;
    return;
  }

  const provider = createSmtpEmailProvider(delivery.delivery.smtpConfig);
  const supabase = createServiceRoleClient();
  const runtime = createSupabaseApplicationEmailRuntime(supabase);
  const result = await processApplicationEmailOutbox({
    runtime,
    authorsSmtpReady: true,
    deliver: async (message) =>
      provider.send({
        from: delivery.delivery.transport.from,
        replyTo: delivery.delivery.transport.replyTo,
        envelopeFrom: delivery.delivery.transport.envelopeFrom,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: { "Message-ID": message.messageId },
      }),
    suppressionsFor: async (normalizedEmail) => {
      const { data, error } = await supabase
        .from("email_suppressions")
        .select("normalized_email, scope, expires_at")
        .eq("normalized_email", normalizedEmail)
        .limit(20);
      if (error) {
        throw new Error("email_suppression_lookup_failed");
      }
      return (data ?? []).flatMap((row) => {
        const scope = String(row.scope ?? "");
        if (!isApplicationSuppressionScope(scope)) {
          return [];
        }
        return [
          {
            normalizedEmail,
            scope,
            expiresAt: row.expires_at ? String(row.expires_at) : null,
          },
        ];
      });
    },
  });

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "application_email_outbox_runner_failed");
  process.exitCode = 1;
});
