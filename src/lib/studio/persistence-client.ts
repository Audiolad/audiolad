"use client";

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
  asset_too_large: "Файл слишком большой для сохранения в проекте.",
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

export async function uploadStudioProjectAsset({
  projectId,
  file,
  sourceType,
  signal,
}: {
  projectId: string;
  file: File;
  sourceType: StudioAssetSourceType;
  signal?: AbortSignal;
}): Promise<StudioUploadedAsset> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("sourceType", sourceType);

  const response = await studioFetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/assets`,
    { method: "POST", body: formData, signal },
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
    !("asset" in body) ||
    !isUploadedAsset(body.asset)
  ) {
    throw new StudioPersistenceClientError("server_error", response.status);
  }

  return body.asset;
}
