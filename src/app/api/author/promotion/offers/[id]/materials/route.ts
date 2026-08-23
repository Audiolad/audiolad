import { POSTMaterial, POSTReorderMaterials } from "@/lib/quick-offers/offers-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);

  if (url.searchParams.get("reorder") === "1") {
    return POSTReorderMaterials(id, request);
  }

  return POSTMaterial(id, request);
}
