export type ClassicaActionState = {
  error: string | null;
  /** Storage path of a file this action just uploaded. Absent for other actions. */
  uploadedPath?: string;
  /**
   * Explicit success. Idle stays `{ error: null }` without `ok`, so a saved
   * card is not the same state as the form before the first submit.
   */
  ok?: boolean;
  /** User-facing success text. Absent while idle or on error. */
  message?: string;
};

export const classicaIdleState: ClassicaActionState = { error: null };
