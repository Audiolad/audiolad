import { buildIndexNowKeyResponse } from "@/lib/seo/indexnow/key-response";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ key: string }>;
};

/**
 * Path-param key file: `/api/seo/indexnow-key/:key`
 * Used by the `/{KEY}.txt` rewrite (beforeFiles).
 */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { key } = await context.params;
  return buildIndexNowKeyResponse(key);
}
