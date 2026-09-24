import { buildDependencyHealthResult } from "@/lib/health/dependencies";
import { probeDatabaseReachable } from "@/lib/health/probe-database";

export const dynamic = "force-dynamic";

export async function GET() {
  const reachable = await probeDatabaseReachable();
  const result = buildDependencyHealthResult(reachable);

  return Response.json(result.body, {
    status: result.httpStatus,
    headers: result.headers,
  });
}
