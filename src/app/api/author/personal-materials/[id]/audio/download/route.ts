import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { requirePersonalMaterialAccess } from "@/lib/personal-materials/server/auth";
import {
  createAuthorAttachmentDownloadSignedUrl,
  toAuthorAttachmentDownloadJsonResponse,
} from "@/lib/personal-materials/server/download";
import {
  handlePersonalMaterialRouteError,
  privateNoStoreHeaders,
} from "@/lib/personal-materials/server/errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { material } = await requirePersonalMaterialAccess(id);

    const signed = await createAuthorAttachmentDownloadSignedUrl(material, "audio");

    return toAuthorAttachmentDownloadJsonResponse(
      {
        downloadUrl: signed.url,
        filename: signed.filename,
        expiresAt: signed.expiresAt,
      },
      privateNoStoreHeaders(),
    );
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
