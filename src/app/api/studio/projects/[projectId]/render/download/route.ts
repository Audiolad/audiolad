import { getStudioRenderState, STUDIO_RENDER_BUCKET } from "@/lib/studio/server/render-jobs";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { StudioApiError, parseUuid } from "@/lib/studio/server/validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const state = await getStudioRenderState(parseUuid((await context.params).projectId, "not_found"));
    if (state.latest?.status !== "completed" || !state.latest.output_storage_path) throw new StudioApiError("not_found", 404);
    const { data, error } = await createServiceRoleClient().storage.from(STUDIO_RENDER_BUCKET).download(state.latest.output_storage_path);
    if (error || !data) throw new StudioApiError("not_found", 404);
    const name = (state.project.name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 100) || "studio-render") + ".mp3";
    return new Response(data.stream(), { headers: { "Content-Type": "audio/mpeg", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "private, no-store" } });
  } catch (error) { return studioRouteError(error, "studio_render_download_error"); }
}
