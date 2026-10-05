import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { parseProductVideoOrientation } from "@/lib/product-video-export/contract";
import { downloadLatestProductVideo } from "@/lib/product-video-export/server";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const url = new URL(request.url);
    const orientation = parseProductVideoOrientation(
      url.searchParams.get("orientation"),
    );
    if (!orientation) {
      return new Response("invalid_orientation", { status: 400 });
    }

    const data = await downloadLatestProductVideo({
      practiceId: id,
      audioItemId: audioId,
      orientation,
    });
    const suffix = orientation === "landscape_16_9" ? "16x9" : "9x16";
    return new Response(data.stream(), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="audiolad-${suffix}.mp4"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
