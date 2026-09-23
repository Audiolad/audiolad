import {
  formatInstalledAuthorEmailOutboxCycle,
  runInstalledAuthorEmailOutboxCycle,
} from "@/lib/email/run-installed-author-email-outbox-cycle";

async function main() {
  const result = await runInstalledAuthorEmailOutboxCycle();
  const formatted = formatInstalledAuthorEmailOutboxCycle(result);
  if (formatted.stderr) console.error(formatted.stderr);
  if (formatted.stdout) console.log(formatted.stdout);
  if (formatted.exitCode !== 0) process.exitCode = formatted.exitCode;
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "author_sale_email_outbox_runner_failed",
  );
  process.exitCode = 1;
});
