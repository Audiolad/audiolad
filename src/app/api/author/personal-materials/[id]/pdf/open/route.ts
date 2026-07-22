import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  createAuthorPdfSignedUrl,
  redirectToSignedPdfUrl,
} from "@/lib/personal-materials/server/delivery";
import { requirePersonalMaterialReadAccess } from "@/lib/personal-materials/server/auth";
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
    const { material } = await requirePersonalMaterialReadAccess(id);

    const signed = await createAuthorPdfSignedUrl(material);

    return redirectToSignedPdfUrl(signed.url, privateNoStoreHeaders());
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
