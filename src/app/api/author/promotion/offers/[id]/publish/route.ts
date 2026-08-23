import { POSTPublish } from "@/lib/quick-offers/offers-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return POSTPublish(id);
}
