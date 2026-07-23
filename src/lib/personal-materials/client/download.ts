import {
  mapPersonalMaterialClientError,
  PersonalMaterialClientError,
} from "./errors";

async function triggerAuthorPersonalMaterialDownload(
  path: string,
): Promise<void> {
  const response = await fetch(path, {
    redirect: "manual",
    cache: "no-store",
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location");

    if (location) {
      window.location.assign(location);
      return;
    }

    throw new PersonalMaterialClientError("internal_error", 500);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    throw mapPersonalMaterialClientError(payload.error, response.status);
  }

  throw new PersonalMaterialClientError("internal_error", 500);
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
