/** How long the more/less button stays in the working state, including a short minimum. */
export const FEEDBACK_WORK_MS = 1200;
export const FEEDBACK_WORK_REDUCED_MS = 450;
/** Confirmation or error stays long enough to read, then the button returns to its label. */
export const FEEDBACK_RESULT_MS = 3000;

export function feedbackHoldMs(elapsed: number, reduced: boolean): number {
  const minimum = reduced ? FEEDBACK_WORK_REDUCED_MS : FEEDBACK_WORK_MS;
  if (!Number.isFinite(elapsed) || elapsed < 0) return minimum;
  return Math.max(0, minimum - elapsed);
}
