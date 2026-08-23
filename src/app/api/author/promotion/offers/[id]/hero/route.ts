import { DELETEHero, POSTHero } from "@/lib/quick-offers/media-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return POSTHero(id, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return DELETEHero(id);
}
