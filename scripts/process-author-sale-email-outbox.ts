import { processAuthorSaleEmailOutbox } from "@/lib/email/process-author-sale-email-outbox";

async function main() {
  const result = await processAuthorSaleEmailOutbox();
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "author_sale_email_outbox_runner_failed",
  );
  process.exitCode = 1;
});
