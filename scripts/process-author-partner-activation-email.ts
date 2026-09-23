import { processAuthorPartnerActivationEmailOutbox } from "@/lib/email/process-author-partner-activation-email";

async function main() {
  const result = await processAuthorPartnerActivationEmailOutbox();
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "author_partner_activation_email_runner_failed",
  );
  process.exitCode = 1;
});
