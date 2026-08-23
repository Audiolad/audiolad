import { DELETEMaterial, PATCHMaterial } from "@/lib/quick-offers/offers-api";

type RouteContext = {
  params: Promise<{ id: string; materialId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id, materialId } = await context.params;
  return PATCHMaterial(id, materialId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, materialId } = await context.params;
  return DELETEMaterial(id, materialId);
}
