import {
  StudioPersistenceError,
  parseStudioProjectDocument,
} from "./persistence";

export type StudioProjectAuditInput = Readonly<{
  projectId: string;
  authorId: string | null;
  authorName?: string | null;
  revision: number;
  projectData: unknown;
  activeAssetIds: readonly string[];
}>;

export type StudioProjectAuditFinding = Readonly<{
  projectId: string;
  authorId: string | null;
  authorName: string | null;
  revision: number;
  defect: string;
  path: string | null;
}>;

export function auditStudioProject(input: StudioProjectAuditInput): StudioProjectAuditFinding[] {
  let document;
  try {
    document = parseStudioProjectDocument(input.projectData);
  } catch (error) {
    if (error instanceof StudioPersistenceError) {
      return [{
        projectId: input.projectId,
        authorId: input.authorId,
        authorName: input.authorName ?? null,
        revision: input.revision,
        defect: error.code,
        path: error.path ?? null,
      }];
    }
    throw error;
  }

  const assets = new Set(input.activeAssetIds);
  return document.tracks.flatMap((track) =>
    assets.has(track.assetId)
      ? []
      : [{
          projectId: input.projectId,
          authorId: input.authorId,
          authorName: input.authorName ?? null,
          revision: input.revision,
          defect: "missing_active_project_asset",
          path: `tracks.${track.id}.assetId`,
        }],
  );
}
