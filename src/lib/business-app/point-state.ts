export const BUSINESS_POINT_STATES = [
  "healthy",
  "autonomous",
  "stopped",
] as const;

export type BusinessPointState = (typeof BUSINESS_POINT_STATES)[number];

export function isBusinessPointState(
  value: string | null | undefined,
): value is BusinessPointState {
  return (
    value === "healthy" || value === "autonomous" || value === "stopped"
  );
}

export function parseBusinessPointState(
  value: string | null | undefined,
  fallback: BusinessPointState = "healthy",
): BusinessPointState {
  return isBusinessPointState(value) ? value : fallback;
}

/** Query param for reviewers to switch mock system state (no debug UI chrome). */
export const BUSINESS_MOCK_STATE_QUERY = "mockState";
