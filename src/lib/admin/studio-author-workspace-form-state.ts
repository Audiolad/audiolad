export type CreateStudioWorkspaceActionState =
  | { ok: false; error: string }
  | {
      ok: true;
      message: string;
      workspace: {
        authorId: string;
        slug: string;
        name: string;
        owner: { id: string; email: string | null; displayName: string | null };
      };
    };

export const CREATE_STUDIO_WORKSPACE_INITIAL_STATE: CreateStudioWorkspaceActionState = {
  ok: false,
  error: "",
};
