export type ClassicaActionState = {
  error: string | null;
  /** Storage path of a file this action just uploaded. Absent for other actions. */
  uploadedPath?: string;
};

export const classicaIdleState: ClassicaActionState = { error: null };
