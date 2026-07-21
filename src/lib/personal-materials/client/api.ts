import {
  mapPersonalMaterialClientError,
  PersonalMaterialClientError,
} from "./errors";
import type {
  ActivateAuthorPersonalMaterialResponse,
  AuthorPersonalMaterial,
  CreateAuthorPersonalMaterialInput,
  RotateAuthorPersonalMaterialResponse,
  UpdateAuthorPersonalMaterialInput,
} from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw mapPersonalMaterialClientError(payload.error, response.status);
  }

  return payload;
}

export async function listAuthorPersonalMaterials(
  authorId: string,
  signal?: AbortSignal,
): Promise<AuthorPersonalMaterial[]> {
  const response = await fetch(
    `/api/author/personal-materials?author_id=${encodeURIComponent(authorId)}`,
    { cache: "no-store", signal },
  );

  const payload = await parseJson<{ materials?: AuthorPersonalMaterial[] }>(response);
  return payload.materials ?? [];
}

export async function createAuthorPersonalMaterial(
  input: CreateAuthorPersonalMaterialInput,
): Promise<AuthorPersonalMaterial> {
  const response = await fetch("/api/author/personal-materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(input),
  });

  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}

export async function getAuthorPersonalMaterial(
  id: string,
  signal?: AbortSignal,
): Promise<AuthorPersonalMaterial> {
  const response = await fetch(`/api/author/personal-materials/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal,
  });

  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}

export async function updateAuthorPersonalMaterial(
  id: string,
  input: UpdateAuthorPersonalMaterialInput,
): Promise<AuthorPersonalMaterial> {
  const response = await fetch(`/api/author/personal-materials/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(input),
  });

  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}

export async function uploadAuthorPersonalMaterialAudio(
  id: string,
  file: File,
): Promise<AuthorPersonalMaterial> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(
    `/api/author/personal-materials/${encodeURIComponent(id)}/audio`,
    {
      method: "POST",
      body: formData,
      cache: "no-store",
    },
  );

  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}

export async function deleteAuthorPersonalMaterialAudio(
  id: string,
): Promise<AuthorPersonalMaterial> {
  const response = await fetch(
    `/api/author/personal-materials/${encodeURIComponent(id)}/audio`,
    {
      method: "DELETE",
      cache: "no-store",
    },
  );

  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}

export async function activateAuthorPersonalMaterial(
  id: string,
  expiresAt?: string | null,
): Promise<ActivateAuthorPersonalMaterialResponse> {
  const response = await fetch(
    `/api/author/personal-materials/${encodeURIComponent(id)}/activate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ expiresAt: expiresAt ?? null }),
    },
  );

  return parseJson<ActivateAuthorPersonalMaterialResponse>(response);
}

export async function rotateAuthorPersonalMaterial(
  id: string,
): Promise<RotateAuthorPersonalMaterialResponse> {
  const response = await fetch(
    `/api/author/personal-materials/${encodeURIComponent(id)}/rotate`,
    {
      method: "POST",
      cache: "no-store",
    },
  );

  return parseJson<RotateAuthorPersonalMaterialResponse>(response);
}

export async function revokeAuthorPersonalMaterial(
  id: string,
): Promise<AuthorPersonalMaterial> {
  const response = await fetch(
    `/api/author/personal-materials/${encodeURIComponent(id)}/revoke`,
    {
      method: "POST",
      cache: "no-store",
    },
  );

  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}

export async function deleteAuthorPersonalMaterial(
  id: string,
): Promise<AuthorPersonalMaterial> {
  const response = await fetch(`/api/author/personal-materials/${encodeURIComponent(id)}`, {
    method: "DELETE",
    cache: "no-store",
  });

  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}

export function isPersonalMaterialClientError(
  error: unknown,
): error is PersonalMaterialClientError {
  return error instanceof PersonalMaterialClientError;
}

export type AuthorPersonalMaterialTemplate = {
  id: string;
  authorId: string;
  internalName: string;
  title: string | null;
  description: string | null;
  personalRecommendation: string | null;
  returnUrl: string | null;
  returnButtonLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateInput = {
  authorId?: string;
  internalName: string;
  title: string | null;
  description: string | null;
  personalRecommendation: string | null;
  returnUrl: string | null;
  returnButtonLabel: string | null;
};

export async function listAuthorPersonalMaterialTemplates(
  authorId: string,
  signal?: AbortSignal,
): Promise<AuthorPersonalMaterialTemplate[]> {
  const response = await fetch(
    `/api/author/personal-material-templates?author_id=${encodeURIComponent(authorId)}`,
    { cache: "no-store", signal },
  );
  const payload = await parseJson<{ templates?: AuthorPersonalMaterialTemplate[] }>(
    response,
  );
  return payload.templates ?? [];
}

export async function getAuthorPersonalMaterialTemplate(
  id: string,
): Promise<AuthorPersonalMaterialTemplate> {
  const response = await fetch(
    `/api/author/personal-material-templates/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  const payload = await parseJson<{ template: AuthorPersonalMaterialTemplate }>(response);
  return payload.template;
}

export async function createAuthorPersonalMaterialTemplate(
  input: TemplateInput & { authorId: string },
): Promise<AuthorPersonalMaterialTemplate> {
  const response = await fetch("/api/author/personal-material-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{ template: AuthorPersonalMaterialTemplate }>(response);
  return payload.template;
}

export async function updateAuthorPersonalMaterialTemplate(
  id: string,
  input: TemplateInput,
): Promise<AuthorPersonalMaterialTemplate> {
  const response = await fetch(
    `/api/author/personal-material-templates/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(input),
    },
  );
  const payload = await parseJson<{ template: AuthorPersonalMaterialTemplate }>(response);
  return payload.template;
}

export async function deleteAuthorPersonalMaterialTemplate(id: string): Promise<void> {
  const response = await fetch(
    `/api/author/personal-material-templates/${encodeURIComponent(id)}`,
    { method: "DELETE", cache: "no-store" },
  );
  await parseJson<{ ok: boolean }>(response);
}

export async function duplicateAuthorPersonalMaterialTemplate(
  id: string,
): Promise<AuthorPersonalMaterialTemplate> {
  const response = await fetch(
    `/api/author/personal-material-templates/${encodeURIComponent(id)}/duplicate`,
    { method: "POST", cache: "no-store" },
  );
  const payload = await parseJson<{ template: AuthorPersonalMaterialTemplate }>(response);
  return payload.template;
}

export async function instantiateAuthorPersonalMaterialTemplate(
  id: string,
): Promise<AuthorPersonalMaterial> {
  const response = await fetch(
    `/api/author/personal-material-templates/${encodeURIComponent(id)}/instantiate`,
    { method: "POST", cache: "no-store" },
  );
  const payload = await parseJson<{ material: AuthorPersonalMaterial }>(response);
  return payload.material;
}
