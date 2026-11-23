"use client";

import { canonicalizeStudioUploadMimeType } from "./recording-mime";
import {
  STUDIO_RESUMABLE_MIN_BYTES,
  forgetStudioResumableUpload,
  isStudioAbortError,
  isStudioResumableUploadError,
  uploadStudioFileResumable,
  type StudioResumableProgress,
  type StudioResumableUploadOptions,
} from "./resumable-upload";

import { STUDIO_ASSETS_BUCKET } from "@/lib/studio/limits";

export type StudioAssetSourceType = "upload" | "recording" | "catalog";

export type StudioUploadedAsset = {
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  sourceType: StudioAssetSourceType;
  createdAt: string;
  catalogPracticeId?: string;
  catalogAudioItemId?: string;
  available?: boolean;
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
  | "catalog_music_forbidden"
  | "catalog_music_unavailable"
  | "catalog_music_render_not_available"
  | "invalid_catalog_audio_item"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "upload_interrupted";

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
  catalog_music_forbidden: "Эта музыка недоступна в Студии.",
  catalog_music_unavailable: "Музыка из каталога больше недоступна для экспорта.",
  catalog_music_render_not_available: "Музыка из каталога больше недоступна для экспорта.",
  invalid_catalog_audio_item: "Не удалось добавить этот трек в проект.",
  rate_limited: "Слишком много попыток. Подождите немного и попробуйте снова.",
  server_error: "Сервер не смог сохранить аудио. Попробуйте ещё раз.",
  network_error: "Не удалось связаться с сервером. Проверьте подключение и повторите.",
  upload_interrupted:
    "Связь с сервером прервалась, загрузка приостановлена. Нажмите «Повторить» – продолжим с того же места.",
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
          serverCode === "catalog_music_forbidden" ||
          serverCode === "catalog_music_unavailable" ||
          serverCode === "catalog_music_render_not_available" ||
          serverCode === "invalid_catalog_audio_item" ||
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
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("projectId" in value) ||
    typeof value.projectId !== "string"
  ) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    "storage_path" in record ||
    "storagePath" in record ||
    "audio_path" in record ||
    "signedUrl" in record
  ) {
    return false;
  }
  return true;
}

export async function attachStudioCatalogAsset({
  projectId,
  practiceId,
  audioItemId,
  signal,
}: {
  projectId: string;
  practiceId: string;
  audioItemId: string;
  signal?: AbortSignal;
}): Promise<StudioUploadedAsset> {
  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets/catalog`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ practiceId, audioItemId }),
      signal,
    },
  );
  if (!response.ok) {
    throw await toStudioFetchError(response);
  }
  return await readAssetResponse(response);
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

export type StudioAssetUploadProgress = {
  phase: "uploading" | "reconnecting" | "finalizing";
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  retryInSeconds: number | null;
};

export type StudioAssetUploadProgressHandler = (progress: StudioAssetUploadProgress) => void;

type StudioResumableTestOverrides = Partial<
  Pick<
    StudioResumableUploadOptions,
    "transport" | "sleep" | "waitForOnline" | "retryDelaysMs" | "store" | "chunkBytes"
  >
>;

let studioResumableTestOverrides: StudioResumableTestOverrides | null = null;

/** Test hook: route resumable uploads through a fake transport/timers. */
export function setStudioResumableUploadTestOverrides(overrides: StudioResumableTestOverrides | null) {
  studioResumableTestOverrides = overrides;
}

function toAssetProgress(progress: StudioResumableProgress): StudioAssetUploadProgress {
  return {
    phase: progress.phase,
    uploadedBytes: progress.uploadedBytes,
    totalBytes: progress.totalBytes,
    // 100% only after the server has checked the file (finalize).
    percent: Math.min(99, progress.percent),
    retryInSeconds:
      progress.retryInMs == null ? null : Math.max(0, Math.ceil(progress.retryInMs / 1000)),
  };
}

function reportFinalizing(file: Blob, onProgress?: StudioAssetUploadProgressHandler) {
  onProgress?.({
    phase: "finalizing",
    uploadedBytes: file.size,
    totalBytes: file.size,
    percent: 99,
    retryInSeconds: null,
  });
}

/**
 * Sends the file bytes for a signed Studio upload. Files of one chunk or more
 * go through resumable TUS (chunks, resume, auto-retry); small files and
 * servers without TUS keep the single signed PUT.
 */
async function transferFileToSignedUpload(
  signedUpload: StudioSignedUpload,
  file: Blob,
  contentType: string,
  signal?: AbortSignal,
  onProgress?: StudioAssetUploadProgressHandler,
) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (base && file.size >= STUDIO_RESUMABLE_MIN_BYTES) {
    try {
      await uploadStudioFileResumable({
        supabaseUrl: base,
        bucket: STUDIO_ASSETS_BUCKET,
        signedUpload,
        file,
        contentType,
        signal,
        ...(studioResumableTestOverrides ?? {}),
        onProgress: onProgress ? (progress) => onProgress(toAssetProgress(progress)) : undefined,
      });
      reportFinalizing(file, onProgress);
      return;
    } catch (error) {
      if (isStudioAbortError(error) || signal?.aborted) throw error;
      if (!isStudioResumableUploadError(error)) throw error;
      if (error.kind === "already_exists") {
        // A previous attempt already stored the object; finalize verifies it.
        reportFinalizing(file, onProgress);
        return;
      }
      if (error.kind === "network") {
        throw new StudioPersistenceClientError("upload_interrupted", error.status ?? undefined);
      }
      if (error.kind === "too_large") {
        throw new StudioPersistenceClientError("asset_too_large", 413);
      }
      if (error.kind === "rejected") {
        throw new StudioPersistenceClientError("server_error", error.status ?? undefined);
      }
      // "unsupported": fall back to the single PUT below.
    }
  }
  onProgress?.({
    phase: "uploading",
    uploadedBytes: 0,
    totalBytes: file.size,
    percent: 0,
    retryInSeconds: null,
  });
  await putFileToSignedUpload(signedUpload, file, contentType, signal);
  reportFinalizing(file, onProgress);
}

function forgetSignedUpload(signedUpload: StudioSignedUpload) {
  forgetStudioResumableUpload(
    STUDIO_ASSETS_BUCKET,
    signedUpload.path.replace(/^\/+/, ""),
    studioResumableTestOverrides?.store,
  );
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
  uploadError?: unknown,
): Promise<StudioUploadedAsset | null> {
  if (uploadError !== undefined && isConnectionError(uploadError)) {
    // Keep the "paused, will resume" error when the server is still unreachable.
    try {
      return await reconcileAfterAmbiguousPut(projectId, assetId);
    } catch (error) {
      if (isConnectionError(error)) return null;
      throw error;
    }
  }
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

const ASSET_RESUME_PREFIX = "audiolad:studio-asset-resume:v1:";
const ASSET_RESUME_TTL_MS = 100 * 60 * 1000;
const activeResumableAssetIds = new Set<string>();

function assetResumeStore(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (studioResumableTestOverrides?.store !== undefined) return studioResumableTestOverrides.store;
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function assetResumeKey(projectId: string, file: File, sourceType: StudioAssetSourceType): string {
  return [
    ASSET_RESUME_PREFIX,
    projectId,
    sourceType,
    String(file.size),
    String(file.lastModified),
    encodeURIComponent(file.name).slice(0, 300),
  ].join(":");
}

function readAssetResume(projectId: string, file: File, sourceType: StudioAssetSourceType): string | null {
  const store = assetResumeStore();
  if (!store) return null;
  const key = assetResumeKey(projectId, file, sourceType);
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as { assetId?: unknown; savedAt?: unknown };
    if (
      typeof value.assetId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(value.assetId) ||
      typeof value.savedAt !== "number" ||
      Date.now() - value.savedAt > ASSET_RESUME_TTL_MS
    ) {
      store.removeItem(key);
      return null;
    }
    return value.assetId;
  } catch {
    return null;
  }
}

function writeAssetResume(projectId: string, file: File, sourceType: StudioAssetSourceType, assetId: string) {
  if (file.size < STUDIO_RESUMABLE_MIN_BYTES) return;
  try {
    assetResumeStore()?.setItem(
      assetResumeKey(projectId, file, sourceType),
      JSON.stringify({ assetId, savedAt: Date.now() }),
    );
  } catch {
    // Resume after reload is best effort.
  }
}

function forgetAssetResume(projectId: string, file: File, sourceType: StudioAssetSourceType) {
  try {
    assetResumeStore()?.removeItem(assetResumeKey(projectId, file, sourceType));
  } catch {
    // ignore
  }
}

function isConnectionError(error: unknown): boolean {
  return (
    error instanceof StudioPersistenceClientError &&
    (error.code === "network_error" || error.code === "upload_interrupted")
  );
}

export async function uploadStudioProjectAsset({
  projectId,
  file,
  sourceType,
  signal,
  onReserved,
  onProgress,
}: {
  projectId: string;
  file: File;
  sourceType: StudioAssetSourceType;
  signal?: AbortSignal;
  onReserved?: (assetId: string) => void;
  onProgress?: StudioAssetUploadProgressHandler;
}): Promise<StudioUploadedAsset> {
  if (file.size >= STUDIO_RESUMABLE_MIN_BYTES && sourceType !== "catalog") {
    // Same file picked again (e.g. after a page reload): continue the
    // unfinished upload of the asset reserved for it instead of restarting.
    const resumeAssetId = readAssetResume(projectId, file, sourceType);
    if (resumeAssetId && !activeResumableAssetIds.has(resumeAssetId)) {
      onReserved?.(resumeAssetId);
      try {
        const resumed = await retryStudioProjectAssetUpload({
          projectId,
          assetId: resumeAssetId,
          file,
          signal,
          onProgress,
          resumeSourceType: sourceType,
        });
        forgetAssetResume(projectId, file, sourceType);
        return resumed;
      } catch (error) {
        if (isStudioAbortError(error) || signal?.aborted) throw error;
        if (isConnectionError(error)) throw error;
        // The old reservation is gone or unusable: start a fresh one.
        forgetAssetResume(projectId, file, sourceType);
      }
    }
  }

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
  const signedUpload = reserved.signedUpload;
  onReserved?.(assetId);
  writeAssetResume(projectId, file, sourceType, assetId);
  activeResumableAssetIds.add(assetId);
  try {
    try {
      await transferFileToSignedUpload(signedUpload, file, reserved.asset.mimeType, signal, onProgress);
    } catch (error) {
      if (isStudioAbortError(error) || signal?.aborted) {
        forgetAssetResume(projectId, file, sourceType);
        forgetSignedUpload(signedUpload);
        await abandonStudioProjectAssetUpload({ projectId, assetId });
        throw error;
      }
      const ready = await reconcileAfterAmbiguousPut(projectId, assetId, error);
      if (ready) {
        forgetAssetResume(projectId, file, sourceType);
        return ready;
      }
      if (!isConnectionError(error)) forgetAssetResume(projectId, file, sourceType);
      throw error;
    }
    const finalized = await finalizeStudioAsset(projectId, assetId, signal);
    forgetAssetResume(projectId, file, sourceType);
    return finalized;
  } finally {
    activeResumableAssetIds.delete(assetId);
  }
}

export async function retryStudioProjectAssetUpload({
  projectId,
  assetId,
  file,
  signal,
  onProgress,
  resumeSourceType,
}: {
  projectId: string;
  assetId: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: StudioAssetUploadProgressHandler;
  /** Set when resuming a reservation remembered for this file. */
  resumeSourceType?: StudioAssetSourceType;
}): Promise<StudioUploadedAsset> {
  activeResumableAssetIds.add(assetId);
  try {
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
    if (resumeSourceType && "asset" in retried && isUploadedAsset(retried.asset)) {
      const asset = retried.asset;
      if (
        asset.sizeBytes !== file.size ||
        asset.sourceType !== resumeSourceType
      ) {
        // Not the reservation for this file: do not resume into it.
        throw new StudioPersistenceClientError("invalid_upload", 409);
      }
    }
    if ("alreadyUploaded" in retried && retried.alreadyUploaded === true) {
      reportFinalizing(file, onProgress);
      return await finalizeStudioAsset(projectId, assetId, signal);
    }
    if (!("signedUpload" in retried) || !isSignedUpload(retried.signedUpload)) {
      throw new StudioPersistenceClientError("server_error", retryResponse.status);
    }
    const signedUpload = retried.signedUpload;
    try {
      await transferFileToSignedUpload(
        signedUpload,
        file,
        canonicalizeStudioUploadMimeType(file),
        signal,
        onProgress,
      );
    } catch (error) {
      if (isStudioAbortError(error) || signal?.aborted) {
        if (resumeSourceType) forgetAssetResume(projectId, file, resumeSourceType);
        forgetSignedUpload(signedUpload);
        await abandonStudioProjectAssetUpload({ projectId, assetId });
        throw error;
      }
      const ready = await reconcileAfterAmbiguousPut(projectId, assetId, error);
      if (ready) return ready;
      throw error;
    }
    return await finalizeStudioAsset(projectId, assetId, signal);
  } finally {
    activeResumableAssetIds.delete(assetId);
  }
}

export async function replaceStudioProjectAsset({
  projectId,
  assetId,
  file,
  signal,
  onProgress,
}: {
  projectId: string;
  assetId: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: StudioAssetUploadProgressHandler;
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
  const signedUpload = reserved.signedUpload;
  try {
    await transferFileToSignedUpload(
      signedUpload,
      file,
      canonicalizeStudioUploadMimeType(file),
      signal,
      onProgress,
    );
    const finalizeResponse = await studioFetch(
      `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/replace/finalize`,
      { method: "POST", signal },
    );
    if (!finalizeResponse.ok) {
      throw await toStudioFetchError(finalizeResponse);
    }
    return await readAssetResponse(finalizeResponse);
  } catch (error) {
    // The server re-reserves a replacement on a new path on every call, so a
    // replacement cannot be resumed across calls: within this call TUS already
    // retried with backoff. Forget the TUS id and release the reservation.
    forgetSignedUpload(signedUpload);
    if (!isAbortError(error) && !signal?.aborted) {
      let finalizeResponse: Response;
      try {
        finalizeResponse = await studioFetch(
          `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/replace/finalize`,
          { method: "POST" },
        );
      } catch (finalizeError) {
        if (!isConnectionError(finalizeError)) throw finalizeError;
        await abandonStudioProjectAssetReplacement({ projectId, assetId });
        throw error;
      }
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
