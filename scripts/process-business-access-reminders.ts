import { processBusinessAccessReminders } from "@/lib/email/process-business-access-reminders";

async function main() {
  const result = await processBusinessAccessReminders();
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "business_access_reminder_runner_failed",
  );
  process.exitCode = 1;
});
