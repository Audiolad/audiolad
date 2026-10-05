import { processSeoReservation5dReminders } from "@/lib/email/process-seo-reservation-5d-reminders";

async function main() {
  const result = await processSeoReservation5dReminders();
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "seo_reservation_5d_reminder_runner_failed",
  );
  process.exitCode = 1;
});
