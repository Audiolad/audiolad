import { POSTReorderMaterials } from "@/lib/quick-offers/offers-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return POSTReorderMaterials(id, request);
}
