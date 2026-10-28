/**
 * Cabinet and SPA signing. Independent from the admin review preview.
 * When the manual gate is on and a venue is known, only ELIGIBLE may be signed.
 */
export function workspaceSignBlocked(input: {
  gateOn: boolean;
  locationId: string | null | undefined;
  decision: string | null | undefined;
}): boolean {
  return Boolean(input.gateOn && input.locationId && input.decision !== "ELIGIBLE");
}
