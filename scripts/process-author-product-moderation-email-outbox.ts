import { processAuthorProductModerationEmailOutbox } from "@/lib/email/process-author-product-moderation-email-outbox";

async function main() {
  const result = await processAuthorProductModerationEmailOutbox();
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "author_product_moderation_email_outbox_runner_failed",
  );
  process.exitCode = 1;
});
