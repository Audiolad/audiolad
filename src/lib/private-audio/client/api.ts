import type {
  PrivateAudioDetailDto,
  PrivateAudioListItemDto,
  PrivateAudioProgressDto,
  PrivateAudioProgressInput,
  PrivateAudioSignedAudioDto,
} from "@/lib/private-audio/types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    opId?: string;
  };

  if (!response.ok) {
    const headerOpId = response.headers.get("x-audiolad-op-id");
    let code =
      typeof payload.error === "string" ? payload.error : "request_failed";

    // Nginx (and other proxies) may return HTML 413 before Next.js runs.
    if (response.status === 413) {
      code = "file_too_large";
    }

    const error = new Error(code) as Error & {
      status: number;
      code: string;
      opId?: string;
    };
    error.status = response.status;
    error.code = code;
    error.opId =
      (typeof payload.opId === "string" && payload.opId) ||
      headerOpId ||
      undefined;
    throw error;
  }

  return payload;
}

export async function fetchPrivateAudioItems(): Promise<PrivateAudioListItemDto[]> {
  const response = await fetch("/api/my-library/private-audio", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  const payload = await parseJson<{ items: PrivateAudioListItemDto[] }>(
    response,
  );
  return payload.items;
}

export async function fetchPrivateAudioItem(
  id: string,
): Promise<PrivateAudioDetailDto> {
  const response = await fetch(
    `/api/my-library/private-audio/${encodeURIComponent(id)}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    },
  );

  const payload = await parseJson<{ item: PrivateAudioDetailDto }>(response);
  return payload.item;
}

export async function createPrivateAudioItemRequest(input: {
  title: string;
  authorText?: string;
  rightsAccepted: boolean;
  audioFile: File;
  coverFile?: File | null;
}): Promise<PrivateAudioDetailDto> {
  const formData = new FormData();
  formData.set("title", input.title);
  formData.set("rightsAccepted", input.rightsAccepted ? "true" : "false");
  formData.set("file", input.audioFile);

  if (input.authorText?.trim()) {
    formData.set("authorText", input.authorText.trim());
  }

  if (input.coverFile) {
    formData.set("cover", input.coverFile);
  }

  const response = await fetch("/api/my-library/private-audio", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });

  const payload = await parseJson<{ item: PrivateAudioDetailDto }>(response);
  return payload.item;
}

export async function updatePrivateAudioItemRequest(
  id: string,
  input: { title: string; authorText?: string | null },
): Promise<PrivateAudioDetailDto> {
  const response = await fetch(
    `/api/my-library/private-audio/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        authorText: input.authorText ?? null,
      }),
      credentials: "same-origin",
    },
  );

  const payload = await parseJson<{ item: PrivateAudioDetailDto }>(response);
  return payload.item;
}

export async function deletePrivateAudioItemRequest(id: string): Promise<void> {
  const response = await fetch(
    `/api/my-library/private-audio/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
    },
  );

  await parseJson<{ ok: true }>(response);
}

export async function uploadPrivateAudioCoverRequest(
  id: string,
  coverFile: File,
): Promise<PrivateAudioDetailDto> {
  const formData = new FormData();
  formData.set("cover", coverFile);

  const response = await fetch(
    `/api/my-library/private-audio/${encodeURIComponent(id)}/cover`,
    {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    },
  );

  const payload = await parseJson<{ item: PrivateAudioDetailDto }>(response);
  return payload.item;
}

export async function deletePrivateAudioCoverRequest(
  id: string,
): Promise<PrivateAudioDetailDto> {
  const response = await fetch(
    `/api/my-library/private-audio/${encodeURIComponent(id)}/cover`,
    {
      method: "DELETE",
      credentials: "same-origin",
    },
  );

  const payload = await parseJson<{ item: PrivateAudioDetailDto }>(response);
  return payload.item;
}

export async function fetchPrivateAudioSignedUrl(
  id: string,
): Promise<PrivateAudioSignedAudioDto> {
  const response = await fetch(
    `/api/my-library/private-audio/${encodeURIComponent(id)}/audio`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    },
  );

  return parseJson<PrivateAudioSignedAudioDto>(response);
}

export async function savePrivateAudioProgressRequest(
  id: string,
  input: PrivateAudioProgressInput,
): Promise<PrivateAudioProgressDto> {
  const response = await fetch(
    `/api/my-library/private-audio/${encodeURIComponent(id)}/progress`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    },
  );

  const payload = await parseJson<{ progress: PrivateAudioProgressDto }>(
    response,
  );
  return payload.progress;
}
