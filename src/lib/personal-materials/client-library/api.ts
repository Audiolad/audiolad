import type {
  MyPersonalMaterialAudioDto,
  MyPersonalMaterialDetailDto,
  MyPersonalMaterialListItemDto,
  MyPersonalMaterialProgressDto,
  MyPersonalMaterialProgressInput,
} from "./types";
import { mapMyMaterialsFetchError } from "./errors";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw mapMyMaterialsFetchError(response);
  }
  return (await response.json()) as T;
}

export async function fetchMyPersonalMaterials(
  signal?: AbortSignal,
): Promise<MyPersonalMaterialListItemDto[]> {
  const response = await fetch("/api/my-materials", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload = await parseJson<{ materials: MyPersonalMaterialListItemDto[] }>(
    response,
  );
  return payload.materials ?? [];
}

export async function fetchMyPersonalMaterial(
  id: string,
  signal?: AbortSignal,
): Promise<MyPersonalMaterialDetailDto> {
  const response = await fetch(`/api/my-materials/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload = await parseJson<{ material: MyPersonalMaterialDetailDto }>(response);
  return payload.material;
}

export async function fetchMyPersonalMaterialAudio(
  id: string,
  signal?: AbortSignal,
): Promise<MyPersonalMaterialAudioDto> {
  const response = await fetch(`/api/my-materials/${encodeURIComponent(id)}/audio`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  return parseJson<MyPersonalMaterialAudioDto>(response);
}

export async function fetchMyPersonalMaterialProgress(
  id: string,
  signal?: AbortSignal,
): Promise<MyPersonalMaterialProgressDto> {
  const response = await fetch(
    `/api/my-materials/${encodeURIComponent(id)}/progress`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );
  const payload = await parseJson<{ progress: MyPersonalMaterialProgressDto }>(
    response,
  );
  return payload.progress;
}

export async function saveMyPersonalMaterialProgressRequest(
  id: string,
  input: MyPersonalMaterialProgressInput,
  signal?: AbortSignal,
): Promise<MyPersonalMaterialProgressDto> {
  const response = await fetch(
    `/api/my-materials/${encodeURIComponent(id)}/progress`,
    {
      method: "PUT",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      signal,
    },
  );
  const payload = await parseJson<{ progress: MyPersonalMaterialProgressDto }>(
    response,
  );
  return payload.progress;
}
