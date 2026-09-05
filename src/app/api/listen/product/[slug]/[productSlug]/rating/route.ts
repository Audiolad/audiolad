import {
  handlePracticeRatingGet,
  handlePracticeRatingPut,
} from "@/lib/ratings/route";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug: authorSlug, productSlug } = await context.params;
    return await handlePracticeRatingGet(request, authorSlug, productSlug);
  } catch (error) {
    console.error("practice_rating_get_error", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { slug: authorSlug, productSlug } = await context.params;
    return await handlePracticeRatingPut(request, authorSlug, productSlug);
  } catch (error) {
    console.error("practice_rating_put_error", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
