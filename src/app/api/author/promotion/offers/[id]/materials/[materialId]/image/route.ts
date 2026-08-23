import { POSTMaterialImage } from "@/lib/quick-offers/media-api";

type RouteContext = {
  params: Promise<{ id: string; materialId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id, materialId } = await context.params;
  return POSTMaterialImage(id, materialId, request);
}
