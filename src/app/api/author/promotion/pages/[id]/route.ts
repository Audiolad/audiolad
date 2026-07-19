import { GETPageDetail, PATCHPage } from "@/lib/promo-pages/pages-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return GETPageDetail(id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return PATCHPage(id, request);
}
