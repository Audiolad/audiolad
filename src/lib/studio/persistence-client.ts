"use client";

import { STUDIO_ASSETS_BUCKET } from "@/lib/studio/limits";

export type StudioAssetSourceType = "upload" | "recording";

export type StudioUploadedAsset = {
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  sourceType: StudioAssetSourceType;
  createdAt: string;
};

export type StudioPersistenceClientErrorCode =
  | "asset_too_large"
  | "audio_too_long"
  | "project_asset_quota_exceeded"
  | "upload_not_complete"
  | "invalid_upload"
  | "invalid_audio_duration"
  | "unauthenticated"
  | "forbidden"
  | "project_not_found"
  | "invalid_project"
  | "invalid_project_document"
  | "asset_not_found"
  | "revision_conflict"
  | "render_already_queued"
  | "no_active_tracks"
  | "invalid_project_asset"
  | "guest_project_limit"
  | "guest_render_entitlement"
  | "rate_limited"
  | "server_error"
  | "network_error";

const ERROR_MESSAGES: Record<StudioPersistenceClientErrorCode, string> = {
  asset_too_large: "Размер одной дорожки превышает лимит Studio — 300 МБ.",
  audio_too_long: "Максимальная продолжительность одной аудиодорожки — 3 часа.",
  project_asset_quota_exceeded: "Общий размер дорожек не может превышать 750 МБ.",
  upload_not_complete: "Загрузка аудио не завершена. Повторите попытку.",
  invalid_upload: "Не удалось сохранить этот аудиофайл.",
  invalid_audio_duration: "Не удалось определить длительность аудиофайла. Выберите другой файл.",
  unauthenticated: "Войдите в аккаунт, чтобы сохранить аудио.",
  forbidden: "Нет доступа к этому проекту.",
  project_not_found: "Проект для сохранения не найден.",
  invalid_project: "Не удалось открыть этот проект.",
  invalid_project_document: "Проект повреждён или создан в неподдерживаемой версии Студии.",
  asset_not_found: "Аудиофайл проекта не найден.",
  revision_conflict: "Проект был изменён в другом окне.",
  render_already_queued: "Экспорт этой версии проекта уже ожидает обработки.",
  no_active_tracks: "Добавьте незаглушённый аудиофрагмент перед экспортом.",
  invalid_project_asset: "Один из аудиофайлов проекта недоступен для экспорта.",
  guest_project_limit: "Чтобы создавать больше проектов, войдите или зарегистрируйтесь.",
  guest_render_entitlement: "Чтобы создавать новые MP3, войдите или зарегистрируйтесь.",
  rate_limited: "Слишком много попыток. Подождите немного и попробуйте снова.",
  server_error: "Сервер не смог сохранить аудио. Попробуйте ещё раз.",
  network_error: "Не удалось связаться с сервером. Проверьте подключение и повторите.",
};

export class StudioPersistenceClientError extends Error {
  constructor(
    readonly code: StudioPersistenceClientErrorCode,
    readonly status?: number,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "StudioPersistenceClientError";
  }
}

function getErrorCode(status: number): StudioPersistenceClientErrorCode {
  if (status === 413) return "asset_too_large";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "project_not_found";
  if (status === 409) return "revision_conflict";
  if (status === 422) return "invalid_upload";
  return "server_error";
}

export type StudioPersistedProject = {
  id: string;
  name: string;
  projectData: unknown;
  revision: number;
};

export type StudioProjectListItem = {
  id: string;
  name: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  revision: number;
};

export type StudioProjectAssetMetadata = StudioUploadedAsset;
export type StudioRenderJob = {
  id: string;
  project_revision: number;
  status: "queued" | "processing" | "completed" | "failed";
  output_storage_path: string | null;
  error_code: string | null;
  error_message_safe: string | null;
};

export async function getStudioRender(projectId: string): Promise<{
  latest: StudioRenderJob | null;
  entitled: StudioRenderJob | null;
  downloadable: StudioRenderJob | null;
  guestRenderConsumed: boolean;
  previewUrl: string | null;
}> {
  const response = await studioFetch(`/api/studio/projects/${encodeURIComponent(projectId)}/render`, { cache: "no-store" });
  if (!response.ok) throw await toStudioFetchError(response);
  const body = await response.json() as {
    latest?: StudioRenderJob | null;
    entitled?: StudioRenderJob | null;
    downloadable?: StudioRenderJob | null;
    guestRenderConsumed?: boolean;
    previewUrl?: string | null;
  };
  return {
    latest: body.latest ?? null,
    entitled: body.entitled ?? null,
    downloadable: body.downloadable ?? null,
    guestRenderConsumed: body.guestRenderConsumed === true,
    previewUrl: body.previewUrl ?? null,
  };
}

export async function queueStudioRender(projectId: string): Promise<StudioRenderJob> {
  const response = await studioFetch(`/api/studio/projects/${encodeURIComponent(projectId)}/render`, { method: "POST" });
  if (!response.ok) throw await toStudioFetchError(response);
  const body = await response.json() as { job?: StudioRenderJob };
  if (!body.job) throw new StudioPersistenceClientError("server_error", response.status);
  return body.job;
}

function isProject(value: unknown): value is StudioPersistedProject {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "name" in value &&
      typeof value.name === "string" &&
      "revision" in value &&
      typeof value.revision === "number" &&
      "projectData" in value,
  );
}

function isProjectListItem(value: unknown): value is StudioProjectListItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "name" in value &&
      typeof value.name === "string" &&
      "updatedAt" in value &&
      typeof value.updatedAt === "string" &&
      "lastOpenedAt" in value &&
      ("revision" in value) &&
      typeof value.revision === "number",
  );
}

export async function listStudioProjects({
  authorId,
  signal,
}: {
  authorId?: string;
  signal?: AbortSignal;
}): Promise<StudioProjectListItem[]> {
  const response = await studioFetch(
    authorId
      ? `/api/studio/projects?authorId=${encodeURIComponent(authorId)}`
      : "/api/studio/projects",
    { signal },
  );
  if (!response.ok) throw await toStudioFetchError(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("projects" in body) ||
    !Array.isArray(body.projects) ||
    !body.projects.every(isProjectListItem)
  ) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  return body.projects;
}

export async function createStudioProject({
  authorId,
  name,
  signal,
}: {
  authorId?: string;
  name: string;
  signal?: AbortSignal;
}): Promise<StudioPersistedProject> {
  const response = await studioFetch("/api/studio/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authorId ? { authorId, name } : { name }),
    signal,
  });
  if (!response.ok) throw await toStudioFetchError(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("project" in body) ||
    !isProject(body.project)
  ) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  return body.project;
}

export async function duplicateStudioProject({
  projectId,
  signal,
}: {
  projectId: string;
  signal?: AbortSignal;
}): Promise<StudioPersistedProject> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/duplicate`,
    { method: "POST", signal },
  );
  if (!response.ok) throw await toStudioFetchError(response);
  const body = await response.json() as { project?: unknown };
  if (!isProject(body.project)) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  return body.project;
}

export async function createStudioGuestHandoff({
  projectId,
  signal,
}: {
  projectId: string;
  signal?: AbortSignal;
}): Promise<{ url: string }> {
  const response = await studioFetch("/api/studio/guest/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
    signal,
  });
  if (!response.ok) throw await toStudioFetchError(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("url" in body) ||
    typeof body.url !== "string" ||
    !body.url.includes("/studio/try/handoff?t=")
  ) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  return { url: body.url };
}

async function studioFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new StudioPersistenceClientError("network_error");
  }
}

async function toStudioFetchError(response: Response): Promise<StudioPersistenceClientError> {
  let serverCode: unknown;
  try {
    const body = await response.json();
    serverCode = body && typeof body === "object" && "error" in body
      ? body.error
      : undefined;
  } catch {
    // Status normalization remains useful for binary and malformed responses.
  }
  return new StudioPersistenceClientError(
    serverCode === "invalid_persisted_project_data"
      ? "invalid_project_document"
      : serverCode === "unsupported_mime_type"
        ? "invalid_upload"
        : serverCode === "render_already_queued" ||
          serverCode === "no_active_tracks" ||
          serverCode === "invalid_project_asset" ||
          serverCode === "invalid_audio_duration" ||
          serverCode === "audio_too_long" ||
          serverCode === "project_asset_quota_exceeded" ||
          serverCode === "upload_not_complete" ||
          serverCode === "guest_project_limit" ||
          serverCode === "guest_render_entitlement" ||
          serverCode === "rate_limited"
        ? serverCode
        : getErrorCode(response.status),
    response.status,
  );
}

export async function getStudioProjectForHydration({
  projectId,
  signal,
}: {
  projectId: string;
  signal?: AbortSignal;
}): Promise<{ project: StudioPersistedProject; assets: StudioProjectAssetMetadata[] }> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}`,
    { signal },
  );
  if (!response.ok) {
    throw await toStudioFetchError(response);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("project" in body) ||
    !isProject(body.project) ||
    !("assets" in body) ||
    !Array.isArray(body.assets) ||
    !body.assets.every(isUploadedAsset)
  ) {
    throw new StudioPersistenceClientError("invalid_project", response.status);
  }
  return { project: body.project, assets: body.assets };
}

export async function updateStudioProject({
  projectId,
  expectedRevision,
  name,
  projectData,
  signal,
}: {
  projectId: string;
  expectedRevision: number;
  name: string;
  projectData: unknown;
  signal?: AbortSignal;
}): Promise<StudioPersistedProject> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision, name, projectData }),
      signal,
    },
  );
  if (!response.ok) throw await toStudioFetchError(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  if (!body || typeof body !== "object" || !("project" in body) || !isProject(body.project)) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  return body.project;
}

export async function deleteStudioProject({
  projectId,
  expectedRevision,
  signal,
}: {
  projectId: string;
  expectedRevision: number;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}?expectedRevision=${encodeURIComponent(String(expectedRevision))}`,
    {
      method: "DELETE",
      signal,
    },
  );
  if (!response.ok) throw await toStudioFetchError(response);
  if (response.status !== 204) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
}

export async function downloadStudioProjectAsset({
  projectId,
  assetId,
  signal,
}: {
  projectId: string;
  assetId: string;
  signal?: AbortSignal;
}): Promise<Blob> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
    { signal },
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new StudioPersistenceClientError("asset_not_found", response.status);
    }
    throw await toStudioFetchError(response);
  }
  return response.blob();
}

export type StudioAssetPlaybackUrl = {
  url: string;
  expiresAt: number;
  durationSeconds: number | null;
};

export async function getStudioAssetPlaybackUrl({
  projectId,
  assetId,
  signal,
}: {
  projectId: string;
  assetId: string;
  signal?: AbortSignal;
}): Promise<StudioAssetPlaybackUrl> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/playback`,
    { cache: "no-store", signal },
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new StudioPersistenceClientError("asset_not_found", response.status);
    }
    throw await toStudioFetchError(response);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("url" in body) ||
    typeof body.url !== "string" ||
    body.url.trim().length === 0 ||
    !("expiresAt" in body)
  ) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  const expiresAt =
    typeof body.expiresAt === "number"
      ? body.expiresAt
      : typeof body.expiresAt === "string"
        ? Date.parse(body.expiresAt)
        : Number.NaN;
  if (!Number.isFinite(expiresAt)) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  const durationSeconds =
    "durationSeconds" in body &&
    typeof body.durationSeconds === "number" &&
    Number.isFinite(body.durationSeconds) &&
    body.durationSeconds > 0
      ? body.durationSeconds
      : null;
  return {
    url: body.url.trim(),
    expiresAt,
    durationSeconds,
  };
}

function isUploadedAsset(value: unknown): value is StudioUploadedAsset {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "projectId" in value &&
      typeof value.projectId === "string",
  );
}

export type StudioSignedUpload = { path: string; token: string };

function isSignedUpload(value: unknown): value is StudioSignedUpload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      typeof value.path === "string" &&
      "token" in value &&
      typeof value.token === "string",
  );
}

async function readAssetResponse(response: Response): Promise<StudioUploadedAsset> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("asset" in body) ||
    !isUploadedAsset(body.asset)
  ) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
  return body.asset;
}

export function studioSignedUploadUrl(signedUpload: StudioSignedUpload): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new StudioPersistenceClientError("server_error");
  }
  const path = signedUpload.path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/upload/sign/${STUDIO_ASSETS_BUCKET}/${path}?token=${encodeURIComponent(signedUpload.token)}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function putFileToSignedUpload(
  signedUpload: StudioSignedUpload,
  file: Blob,
  contentType: string,
  signal?: AbortSignal,
) {
  const response = await studioFetch(studioSignedUploadUrl(signedUpload), {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    signal,
  });
  if (!response.ok) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }
}

async function finalizeStudioAsset(
  projectId: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<StudioUploadedAsset> {
  const finalizeResponse = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/finalize`,
    { method: "POST", signal },
  );
  if (!finalizeResponse.ok) {
    throw await toStudioFetchError(finalizeResponse);
  }
  return await readAssetResponse(finalizeResponse);
}

async function reconcileAfterAmbiguousPut(
  projectId: string,
  assetId: string,
): Promise<StudioUploadedAsset | null> {
  const finalizeResponse = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/finalize`,
    { method: "POST" },
  );
  if (finalizeResponse.ok) {
    return await readAssetResponse(finalizeResponse);
  }
  const error = await toStudioFetchError(finalizeResponse);
  if (error.code === "upload_not_complete") {
    return null;
  }
  throw error;
}

export async function abandonStudioProjectAssetUpload({
  projectId,
  assetId,
}: {
  projectId: string;
  assetId: string;
}): Promise<void> {
  await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/abandon`,
    { method: "POST" },
  ).catch(() => undefined);
}

export async function abandonStudioProjectAssetReplacement({
  projectId,
  assetId,
}: {
  projectId: string;
  assetId: string;
}): Promise<void> {
  await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/replace/abandon`,
    { method: "POST" },
  ).catch(() => undefined);
}

export async function uploadStudioProjectAsset({
  projectId,
  file,
  sourceType,
  signal,
  onReserved,
}: {
  projectId: string;
  file: File;
  sourceType: StudioAssetSourceType;
  signal?: AbortSignal;
  onReserved?: (assetId: string) => void;
}): Promise<StudioUploadedAsset> {
  const reserveResponse = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        sourceType,
      }),
      signal,
    },
  );
  if (!reserveResponse.ok) {
    throw await toStudioFetchError(reserveResponse);
  }
  let reserved: unknown;
  try {
    reserved = await reserveResponse.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", reserveResponse.status);
  }
  if (
    !reserved ||
    typeof reserved !== "object" ||
    !("asset" in reserved) ||
    !isUploadedAsset(reserved.asset) ||
    !("signedUpload" in reserved) ||
    !isSignedUpload(reserved.signedUpload)
  ) {
    throw new StudioPersistenceClientError("server_error", reserveResponse.status);
  }

  const assetId = reserved.asset.id;
  onReserved?.(assetId);
  try {
    await putFileToSignedUpload(reserved.signedUpload, file, reserved.asset.mimeType, signal);
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      await abandonStudioProjectAssetUpload({ projectId, assetId });
      throw error;
    }
    const ready = await reconcileAfterAmbiguousPut(projectId, assetId);
    if (ready) return ready;
    throw error;
  }
  return await finalizeStudioAsset(projectId, assetId, signal);
}

export async function retryStudioProjectAssetUpload({
  projectId,
  assetId,
  file,
  signal,
}: {
  projectId: string;
  assetId: string;
  file: File;
  signal?: AbortSignal;
}): Promise<StudioUploadedAsset> {
  const retryResponse = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/retry`,
    { method: "POST", signal },
  );
  if (!retryResponse.ok) {
    throw await toStudioFetchError(retryResponse);
  }
  let retried: unknown;
  try {
    retried = await retryResponse.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", retryResponse.status);
  }
  if (!retried || typeof retried !== "object") {
    throw new StudioPersistenceClientError("server_error", retryResponse.status);
  }
  if ("alreadyUploaded" in retried && retried.alreadyUploaded === true) {
    return await finalizeStudioAsset(projectId, assetId, signal);
  }
  if (!("signedUpload" in retried) || !isSignedUpload(retried.signedUpload)) {
    throw new StudioPersistenceClientError("server_error", retryResponse.status);
  }
  try {
    await putFileToSignedUpload(retried.signedUpload, file, file.type || "audio/mpeg", signal);
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      await abandonStudioProjectAssetUpload({ projectId, assetId });
      throw error;
    }
    const ready = await reconcileAfterAmbiguousPut(projectId, assetId);
    if (ready) return ready;
    throw error;
  }
  return await finalizeStudioAsset(projectId, assetId, signal);
}

export async function replaceStudioProjectAsset({
  projectId,
  assetId,
  file,
  signal,
}: {
  projectId: string;
  assetId: string;
  file: File;
  signal?: AbortSignal;
}): Promise<StudioUploadedAsset> {
  const reserveResponse = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
      signal,
    },
  );
  if (!reserveResponse.ok) {
    throw await toStudioFetchError(reserveResponse);
  }
  let reserved: unknown;
  try {
    reserved = await reserveResponse.json();
  } catch {
    throw new StudioPersistenceClientError("server_error", reserveResponse.status);
  }
  if (
    !reserved ||
    typeof reserved !== "object" ||
    !("signedUpload" in reserved) ||
    !isSignedUpload(reserved.signedUpload)
  ) {
    throw new StudioPersistenceClientError("server_error", reserveResponse.status);
  }
  try {
    await putFileToSignedUpload(reserved.signedUpload, file, file.type || "audio/mpeg", signal);
    const finalizeResponse = await studioFetch(
      `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/replace/finalize`,
      { method: "POST", signal },
    );
    if (!finalizeResponse.ok) {
      throw await toStudioFetchError(finalizeResponse);
    }
    return await readAssetResponse(finalizeResponse);
  } catch (error) {
    if (!isAbortError(error) && !signal?.aborted) {
      const finalizeResponse = await studioFetch(
        `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/replace/finalize`,
        { method: "POST" },
      );
      if (finalizeResponse.ok) {
        return await readAssetResponse(finalizeResponse);
      }
      const finalizeError = await toStudioFetchError(finalizeResponse);
      if (finalizeError.code !== "upload_not_complete") {
        await abandonStudioProjectAssetReplacement({ projectId, assetId });
        throw finalizeError;
      }
    }
    await abandonStudioProjectAssetReplacement({ projectId, assetId });
    throw error;
  }
}

export async function deleteStudioProjectAsset({
  projectId,
  assetId,
  signal,
}: {
  projectId: string;
  assetId: string;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
    { method: "DELETE", signal },
  );
  if (!response.ok) {
    throw await toStudioFetchError(response);
  }
}
