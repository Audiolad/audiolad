import { readRecoveryStage } from "@/lib/auth/recovery-intent";
import { cookies } from "next/headers";
import { Suspense } from "react";

import RecoveryLanding from "./recovery-landing";

export default async function RecoveryPage() {
  const cookieStore = await cookies();
  const initialHasStagedRecovery = Boolean(readRecoveryStage(cookieStore));

  return (
    <Suspense>
      <RecoveryLanding initialHasStagedRecovery={initialHasStagedRecovery} />
    </Suspense>
  );
}
