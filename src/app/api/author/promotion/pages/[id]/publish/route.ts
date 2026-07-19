import { POSTPublish } from "@/lib/promo-pages/pages-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return POSTPublish(id);
}
