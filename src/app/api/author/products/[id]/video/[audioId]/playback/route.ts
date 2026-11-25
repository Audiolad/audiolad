import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { parseProductVideoOrientation } from "@/lib/product-video-export/contract";
import { createLatestProductVideoPlaybackUrl } from "@/lib/product-video-export/server";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const orientation = parseProductVideoOrientation(
      new URL(request.url).searchParams.get("orientation"),
    );
    if (!orientation) {
      return new Response("invalid_orientation", { status: 400 });
    }
    const signedUrl = await createLatestProductVideoPlaybackUrl({
      practiceId: id,
      audioItemId: audioId,
      orientation,
    });
    return Response.redirect(signedUrl, 307);
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
