import { reconcilePendingGetCourseAppreciationIntents } from "@/lib/author-appreciation/getcourse/reconcile";

async function main() {
  const result = await reconcilePendingGetCourseAppreciationIntents();
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "author_appreciation_getcourse_reconcile_runner_failed",
  );
  process.exitCode = 1;
});
