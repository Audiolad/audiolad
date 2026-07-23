import { sanitizePersonalMaterialDownloadFilename } from "@/lib/personal-materials/download-filename";
import {
  mapPersonalMaterialClientError,
  PersonalMaterialClientError,
} from "./errors";

export type AuthorAttachmentDownloadResponse = {
  downloadUrl: string;
  filename: string;
  expiresAt: string;
};

function triggerBrowserDownload(downloadUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function fetchAuthorPersonalMaterialDownloadUrl(
  path: string,
): Promise<AuthorAttachmentDownloadResponse> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    throw mapPersonalMaterialClientError(payload.error, response.status);
  }

  const payload = (await response.json()) as Partial<AuthorAttachmentDownloadResponse>;

  if (!payload.downloadUrl?.trim()) {
    throw new PersonalMaterialClientError("internal_error", 500);
  }

  const fallbackFilename = path.includes("/pdf/download") ? "document.pdf" : "audio.mp3";

  return {
    downloadUrl: payload.downloadUrl.trim(),
    filename: sanitizePersonalMaterialDownloadFilename(
      payload.filename?.trim() || fallbackFilename,
      fallbackFilename,
    ),
    expiresAt: payload.expiresAt?.trim() || "",
  };
}

async function triggerAuthorPersonalMaterialDownload(
  path: string,
): Promise<void> {
  const payload = await fetchAuthorPersonalMaterialDownloadUrl(path);
  triggerBrowserDownload(payload.downloadUrl, payload.filename);
}

export async function downloadAuthorPersonalMaterialAudio(
  materialId: string,
): Promise<void> {
  await triggerAuthorPersonalMaterialDownload(
    `/api/author/personal-materials/${encodeURIComponent(materialId)}/audio/download`,
  );
}

export async function downloadAuthorPersonalMaterialPdf(
  materialId: string,
): Promise<void> {
  await triggerAuthorPersonalMaterialDownload(
    `/api/author/personal-materials/${encodeURIComponent(materialId)}/pdf/download`,
  );
}

export {
  fetchAuthorPersonalMaterialDownloadUrl,
  triggerBrowserDownload,
};
