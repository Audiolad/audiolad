import { handleListenStatsGet, handleListenStatsPut } from "@/lib/listen/listen-stats-route";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug: authorSlug, productSlug } = await context.params;
    return await handleListenStatsGet(request, authorSlug, productSlug);
  } catch (error) {
    console.error("listen_stats_get_error", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { slug: authorSlug, productSlug } = await context.params;
    return await handleListenStatsPut(request, authorSlug, productSlug);
  } catch (error) {
    console.error("listen_stats_put_error", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
