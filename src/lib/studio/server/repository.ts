import "server-only";

import { randomUUID } from "node:crypto";

import {
  AuthorAccessError,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { remapStudioProjectForDuplicate } from "../duplicate-project";
import { resolveStudioActor, toStudioActorView } from "../guest-access";
import {
  canCreateGuestProject,
  resolveStudioProjectAccess,
} from "../guest-policy";
import { getGuestSession } from "./guest-session";
import {
  EMPTY_STUDIO_PROJECT_DATA,
  STUDIO_ASSETS_BUCKET,
  type StudioProjectAssetRow,
  type StudioProjectDataV2,
  type StudioProjectListItem,
  type StudioProjectRow,
} from "./model";
import {
  buildStudioAssetPath,
  isStudioStoragePath,
  parseStudioProjectData,
  StudioApiError,
} from "./validation";

const PROJECT_SELECT =
  "id, author_id, guest_session_id, name, project_data, schema_version, revision, status, created_at, updated_at, last_opened_at, deleted_at";
const PROJECT_LIST_SELECT = "id, name, updated_at, last_opened_at, revision";
const ASSET_SELECT =
  "id, project_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type, created_at, deleted_at";

export type StudioProjectAccess = {
  ownerKind: "author" | "guest";
  ownerId: string;
  authorId: string | null;
  guestSessionId: string | null;
  service: ReturnType<typeof createServiceRoleClient>;
};

function mapServiceError(error: { message: string }, fallback = "internal_error"): never {
  const message = error.message.toLowerCase();
  if (message.includes("project_asset_quota_exceeded")) {
    throw new StudioApiError("project_asset_quota_exceeded", 413);
  }
  if (message.includes("guest_project_limit")) {
    throw new StudioApiError("guest_project_limit", 403);
  }
  if (message.includes("project_conflict")) {
    throw new StudioApiError("project_conflict", 409);
  }
  if (message.includes("project_not_found")) {
    throw new StudioApiError("not_found", 404);
  }
  if (message.includes("invalid_asset") || message.includes("invalid_project")) {
    throw new StudioApiError("invalid_asset", 422);
  }
  console.error("studio_service_error", error.message);
  throw new StudioApiError(fallback, 500);
}

function hiddenAccessError(error: unknown): never {
  if (error instanceof AuthorAccessError && error.code === "forbidden") {
    throw new StudioApiError("not_found", 404);
  }
  throw error;
}

export async function requireStudioWorkspaceAccess(authorId: string) {
  try {
    return await requireAuthorMembership(authorId);
  } catch (error) {
    hiddenAccessError(error);
  }
}

export async function requireStudioProjectAccess(projectId: string): Promise<StudioProjectAccess> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_projects")
    .select("id, author_id, guest_session_id, status")
    .eq("id", projectId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    mapServiceError(error);
  }

  const actor = await resolveStudioActor();
  let authorIds: string[] = [];
  if (data?.author_id) {
    await requireAuthenticatedUser();
    try {
      await requireAuthorMembership(data.author_id as string);
      authorIds = [data.author_id as string];
    } catch (membershipError) {
      hiddenAccessError(membershipError);
    }
  }

  const access = resolveStudioProjectAccess({
    project: data
      ? {
          id: data.id as string,
          status: data.status as string,
          author_id: (data.author_id as string | null) ?? null,
          guest_session_id: (data.guest_session_id as string | null) ?? null,
        }
      : null,
    actor: data?.author_id
      ? { kind: "author", authorIds }
      : toStudioActorView(actor),
  });

  if (!access.ok) {
    throw new StudioApiError("not_found", 404);
  }

  return {
    ownerKind: access.ownerKind,
    ownerId: access.ownerId,
    authorId: access.authorId,
    guestSessionId: access.guestSessionId,
    service,
  };
}

export async function listStudioProjects(authorId: string) {
  await requireStudioWorkspaceAccess(authorId);
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_projects")
    .select(PROJECT_LIST_SELECT)
    .eq("author_id", authorId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) {
    mapServiceError(error);
  }
  return (data ?? []) as StudioProjectListItem[];
}

export async function listStudioProjectsForGuest(guestSessionId: string) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_projects")
    .select(PROJECT_LIST_SELECT)
    .eq("guest_session_id", guestSessionId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) {
    mapServiceError(error);
  }
  return (data ?? []) as StudioProjectListItem[];
}

export async function countActiveGuestProjects(guestSessionId: string): Promise<number> {
  const service = createServiceRoleClient();
  const { count, error } = await service
    .from("studio_projects")
    .select("id", { count: "exact", head: true })
    .eq("guest_session_id", guestSessionId)
    .eq("status", "active");
  if (error) {
    mapServiceError(error);
  }
  return count ?? 0;
}

export async function createStudioProject(input: {
  authorId?: string;
  name: string;
}) {
  if (input.authorId) {
    await requireStudioWorkspaceAccess(input.authorId);
    const projectId = randomUUID();
    await recordAuthorSupportAudit({
      action: "studio_project_created",
      resourceType: "studio_project",
      resourceId: projectId,
      metadata: { author_id: input.authorId },
    });
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("studio_projects")
      .insert({
        id: projectId,
        author_id: input.authorId,
        guest_session_id: null,
        name: input.name,
        project_data: EMPTY_STUDIO_PROJECT_DATA,
        schema_version: 2,
        revision: 1,
        status: "active",
      })
      .select(PROJECT_SELECT)
      .single();
    if (error) {
      mapServiceError(error);
    }
    return data as StudioProjectRow;
  }

  const session = await getGuestSession();
  if (!session) {
    throw new StudioApiError("unauthenticated", 401);
  }
  const activeCount = await countActiveGuestProjects(session.id);
  if (!canCreateGuestProject(activeCount)) {
    throw new StudioApiError("guest_project_limit", 403);
  }
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_projects")
    .insert({
      author_id: null,
      guest_session_id: session.id,
      name: input.name,
      project_data: EMPTY_STUDIO_PROJECT_DATA,
      schema_version: 2,
      revision: 1,
      status: "active",
    })
    .select(PROJECT_SELECT)
    .single();
  if (error) {
    mapServiceError(error);
  }
  return data as StudioProjectRow;
}

async function removeStudioStoragePaths(paths: readonly string[]) {
  if (paths.length === 0) return;
  const service = createServiceRoleClient();
  const { error } = await service.storage.from(STUDIO_ASSETS_BUCKET).remove([...new Set(paths)]);
  if (error) {
    console.error("studio_asset_source_cleanup_error", error.message);
  }
}

export async function duplicateStudioProject(sourceProjectId: string) {
  const source = await getStudioProject(sourceProjectId);
  const { service } = await requireStudioProjectAccess(sourceProjectId);
  const remapped = remapStudioProjectForDuplicate(source.project_data);
  const projectId = randomUUID();
  const { data, error } = await service.rpc("duplicate_studio_project", {
    p_source_project_id: sourceProjectId,
    p_project_id: projectId,
    p_project_data: remapped.projectData,
    p_asset_refs: remapped.assets.map((asset) => ({
      source_asset_id: asset.sourceAssetId,
      asset_id: asset.assetId,
    })),
  });
  if (error) mapServiceError(error);
  if (!data) throw new StudioApiError("internal_error", 500);
  await recordAuthorSupportAudit({
    action: "studio_project_duplicated",
    resourceType: "studio_project",
    resourceId: projectId,
    metadata: { source_project_id: sourceProjectId },
  });
  return data as StudioProjectRow;
}

export async function getStudioProject(projectId: string) {
  const { service } = await requireStudioProjectAccess(projectId);
  const { data, error } = await service
    .from("studio_projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    mapServiceError(error);
  }
  if (!data) {
    throw new StudioApiError("not_found", 404);
  }

  try {
    parseStudioProjectData((data as StudioProjectRow).project_data);
  } catch (error) {
    if (error instanceof StudioApiError) {
      console.error("studio_invalid_persisted_project_data", { projectId });
      throw new StudioApiError("invalid_persisted_project_data", 500);
    }
    throw error;
  }

  return data as StudioProjectRow;
}

export async function validateStudioProjectAssetReferences(
  service: ReturnType<typeof createServiceRoleClient>,
  projectId: string,
  assetIds: Iterable<string>,
): Promise<void> {
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) {
    return;
  }

  const { data, error } = await service
    .from("studio_project_assets")
    .select("id")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) {
    mapServiceError(error);
  }

  if ((data ?? []).length !== ids.length) {
    throw new StudioApiError("invalid_project_asset", 422);
  }
}

export async function updateStudioProject(input: {
  projectId: string;
  expectedRevision: number;
  name: string;
  projectData: StudioProjectDataV2;
}) {
  const { service } = await requireStudioProjectAccess(input.projectId);
  await recordAuthorSupportAudit({
    action: "studio_project_updated",
    resourceType: "studio_project",
    resourceId: input.projectId,
    metadata: { changed_fields: ["name", "project_data", "revision"] },
  });
  await validateStudioProjectAssetReferences(
    service,
    input.projectId,
    input.projectData.tracks.map((track) => track.assetId),
  );
  const { data, error } = await service
    .from("studio_projects")
    .update({
      name: input.name,
      project_data: input.projectData,
      revision: input.expectedRevision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.projectId)
    .eq("status", "active")
    .eq("revision", input.expectedRevision)
    .select(PROJECT_SELECT)
    .maybeSingle();
  if (error) {
    mapServiceError(error);
  }
  if (!data) {
    throw new StudioApiError("project_conflict", 409);
  }
  return data as StudioProjectRow;
}

export async function softDeleteStudioProject(input: {
  projectId: string;
  expectedRevision: number;
}) {
  const { service } = await requireStudioProjectAccess(input.projectId);
  await recordAuthorSupportAudit({
    action: "studio_project_deleted",
    resourceType: "studio_project",
    resourceId: input.projectId,
    metadata: { changed_fields: ["status"], status: "deleted" },
  });
  const { data, error } = await service.rpc("soft_delete_studio_project", {
    p_project_id: input.projectId,
    p_expected_revision: input.expectedRevision,
  });
  if (error) mapServiceError(error);
  await removeStudioStoragePaths((data ?? []).map((row: { storage_path: string }) => row.storage_path));
}

export async function listStudioAssets(projectId: string) {
  const { service } = await requireStudioProjectAccess(projectId);
  const { data, error } = await service
    .from("studio_project_assets")
    .select(ASSET_SELECT)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    mapServiceError(error);
  }
  return (data ?? []) as StudioProjectAssetRow[];
}

export async function reserveStudioAssetUpload(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sourceType: "upload" | "recording";
  durationSeconds: number | null;
}) {
  const { ownerId, ownerKind, service } = await requireStudioProjectAccess(input.projectId);
  const assetId = randomUUID();
  await recordAuthorSupportAudit({
    action: "studio_asset_uploaded",
    resourceType: "studio_project_asset",
    resourceId: assetId,
    metadata: { project_id: input.projectId },
  });
  const storagePath = buildStudioAssetPath(
    ownerId,
    input.projectId,
    assetId,
    input.filename,
    ownerKind,
  );
  const { data, error } = await service.rpc("studio_reserve_project_asset", {
    p_project_id: input.projectId,
    p_asset_id: assetId,
    p_storage_path: storagePath,
    p_original_name: input.filename,
    p_mime_type: input.mimeType,
    p_size_bytes: input.byteSize,
    p_source_type: input.sourceType,
    p_duration_seconds: input.durationSeconds,
  });
  if (error) {
    mapServiceError(error);
  }
  return { asset: data as StudioProjectAssetRow, ownerId, ownerKind };
}

export async function cleanupStudioAssetReservation(asset: StudioProjectAssetRow) {
  await deleteStudioProjectAsset(asset.project_id, asset.id);
}

export async function uploadReservedStudioAsset(
  asset: StudioProjectAssetRow,
  ownerId: string,
  file: File,
  ownerKind: "author" | "guest" = "author",
) {
  if (
    !isStudioStoragePath(
      asset.storage_path,
      ownerId,
      asset.project_id,
      asset.id,
      ownerKind,
    )
  ) {
    throw new StudioApiError("invalid_asset", 500);
  }
  const service = createServiceRoleClient();
  const { error } = await service.storage
    .from(STUDIO_ASSETS_BUCKET)
    .upload(asset.storage_path, Buffer.from(await file.arrayBuffer()), {
      contentType: asset.mime_type,
      upsert: false,
    });
  if (error) {
    console.error("studio_asset_upload_error", error.message);
    throw new StudioApiError("storage_upload_failed", 502);
  }
}

export async function replaceStudioProjectAsset(input: {
  projectId: string;
  assetId: string;
  file: File;
  filename: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number | null;
}) {
  const { asset, service, ownerId, ownerKind } = await getStudioProjectAsset(
    input.projectId,
    input.assetId,
  );
  await recordAuthorSupportAudit({
    action: "studio_asset_replaced",
    resourceType: "studio_project_asset",
    resourceId: input.assetId,
    metadata: { project_id: input.projectId },
  });

  const sourceId = randomUUID();
  const storagePath = buildStudioAssetPath(
    ownerId,
    input.projectId,
    sourceId,
    input.filename,
    ownerKind,
  );
  const { error: uploadError } = await service.storage
    .from(STUDIO_ASSETS_BUCKET)
    .upload(storagePath, Buffer.from(await input.file.arrayBuffer()), {
      contentType: input.mimeType,
      upsert: false,
    });
  if (uploadError) {
    console.error("studio_asset_replace_error", uploadError.message);
    throw new StudioApiError("storage_upload_failed", 502);
  }

  const { data: released, error } = await service.rpc("replace_studio_project_asset", {
    p_project_id: input.projectId,
    p_asset_id: input.assetId,
    p_source_id: sourceId,
    p_storage_path: storagePath,
    p_original_name: input.filename,
    p_mime_type: input.mimeType,
    p_size_bytes: input.byteSize,
    p_duration_seconds: input.durationSeconds,
  });
  if (error) {
    await removeStudioStoragePaths([storagePath]);
    mapServiceError(error);
  }
  await removeStudioStoragePaths((released ?? []).map((row: { storage_path: string }) => row.storage_path));
  return {
    ...asset,
    storage_path: storagePath,
    original_name: input.filename,
    mime_type: input.mimeType,
    size_bytes: input.byteSize,
    duration_seconds: input.durationSeconds,
  };
}

export async function deleteStudioProjectAsset(projectId: string, assetId: string) {
  const { asset, service } = await getStudioProjectAsset(projectId, assetId);
  await recordAuthorSupportAudit({
    action: "studio_asset_deleted",
    resourceType: "studio_project_asset",
    resourceId: assetId,
    metadata: { project_id: projectId },
  });

  const { data, error } = await service.rpc("release_studio_project_asset", {
    p_project_id: projectId,
    p_asset_id: assetId,
  });
  if (error) mapServiceError(error);
  await removeStudioStoragePaths((data ?? []).map((row: { storage_path: string }) => row.storage_path));
}

export async function getStudioProjectAsset(
  projectId: string,
  assetId: string,
) {
  const { service } = await requireStudioProjectAccess(projectId);
  const { data, error } = await service
    .from("studio_project_assets")
    .select(ASSET_SELECT)
    .eq("id", assetId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    mapServiceError(error);
  }
  if (!data) {
    throw new StudioApiError("not_found", 404);
  }
  const asset = data as StudioProjectAssetRow;
  const access = await requireStudioProjectAccess(projectId);
  return { asset, service, ownerId: access.ownerId, ownerKind: access.ownerKind };
}

export async function downloadStudioProjectAsset(projectId: string, assetId: string) {
  const { asset, service } = await getStudioProjectAsset(projectId, assetId);
  const { data, error } = await service.storage
    .from(STUDIO_ASSETS_BUCKET)
    .download(asset.storage_path);
  if (error || !data) {
    console.error("studio_asset_download_error", error?.message);
    throw new StudioApiError("not_found", 404);
  }
  return { asset, body: data };
}
