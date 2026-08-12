import { NextResponse } from "next/server";

import { createStudioRenderJob, getStudioRenderState, STUDIO_RENDER_BUCKET } from "@/lib/studio/server/render-jobs";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { parseUuid } from "@/lib/studio/server/validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Context = { params: Promise<{ projectId: string }> };
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: Context) {
  try {
    const state = await getStudioRenderState(parseUuid((await context.params).projectId, "not_found"));
    let previewUrl: string | null = null;
    if (state.latest?.status === "completed" && state.latest.output_storage_path) {
      const { data, error } = await createServiceRoleClient().storage.from(STUDIO_RENDER_BUCKET)
        .createSignedUrl(state.latest.output_storage_path, 600);
      if (error || !data?.signedUrl) {
        console.error("studio_render_preview_url_failed", error?.message);
      } else {
        previewUrl = data.signedUrl;
      }
    }
    return NextResponse.json({ latest: state.latest, previewUrl }, { headers });
  } catch (error) { return studioRouteError(error, "studio_render_get_error"); }
}

export async function POST(_request: Request, context: Context) {
  try {
    const job = await createStudioRenderJob(parseUuid((await context.params).projectId, "not_found"));
    return NextResponse.json({ job }, { status: 202, headers });
  } catch (error) { return studioRouteError(error, "studio_render_create_error"); }
}
