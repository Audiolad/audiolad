import { GETOfferDetail, PATCHOffer } from "@/lib/quick-offers/offers-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return GETOfferDetail(id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return PATCHOffer(id, request);
}
