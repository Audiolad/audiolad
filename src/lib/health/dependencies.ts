export const DEPENDENCY_HEALTH_CACHE_CONTROL = "no-store";

export type DependencyHealthBody =
  | { status: "ok"; database: "ok" }
  | { status: "degraded"; database: "unavailable" };

export type DependencyHealthResult = {
  httpStatus: 200 | 503;
  body: DependencyHealthBody;
  headers: { "Cache-Control": typeof DEPENDENCY_HEALTH_CACHE_CONTROL };
};

export function buildDependencyHealthResult(
  databaseReachable: boolean,
): DependencyHealthResult {
  if (databaseReachable) {
    return {
      httpStatus: 200,
      body: { status: "ok", database: "ok" },
      headers: { "Cache-Control": DEPENDENCY_HEALTH_CACHE_CONTROL },
    };
  }

  return {
    httpStatus: 503,
    body: { status: "degraded", database: "unavailable" },
    headers: { "Cache-Control": DEPENDENCY_HEALTH_CACHE_CONTROL },
  };
}
