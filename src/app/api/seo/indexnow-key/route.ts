import { buildIndexNowKeyResponse } from "@/lib/seo/indexnow/key-response";

export const dynamic = "force-dynamic";

/**
 * Query-param key probe: `/api/seo/indexnow-key?key=…`
 * Public ownership URL is `/{KEY}.txt` (rewritten to the path route).
 */
export async function GET(request: Request): Promise<Response> {
  const requestedKey = new URL(request.url).searchParams.get("key");
  return buildIndexNowKeyResponse(requestedKey);
}
