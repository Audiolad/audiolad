import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resetPracticeProgress,
  upsertPracticeProgress,
} from "@/lib/listen/progress";

export function createPracticeProgressWriter() {
  return createServiceRoleClient();
}

export async function writeOwnPracticeProgress(input: {
  userId: string;
  practiceId: string;
  audioItemId: string;
  positionSeconds: number;
  completed: boolean;
}): Promise<void> {
  const writer = createPracticeProgressWriter();
  await upsertPracticeProgress(
    writer,
    input.userId,
    input.practiceId,
    input.audioItemId,
    input.positionSeconds,
    input.completed,
  );
}

export async function resetOwnPracticeProgress(
  userId: string,
  practiceId: string,
): Promise<void> {
  const writer = createPracticeProgressWriter();
  await resetPracticeProgress(writer, userId, practiceId);
}
