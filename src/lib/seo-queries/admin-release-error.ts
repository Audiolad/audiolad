/** Stable diagnostic code for DELETE /api/admin/seo-queries. */
export function adminSeoReservationReleaseDiagnosticCode(error: {
  message?: string | null;
  code?: string | null;
  details?: string | null;
}): string {
  const message = typeof error.message === "string" ? error.message : "";
  const details = typeof error.details === "string" ? error.details : "";
  const constraint = `${message}\n${details}`.match(/constraint "([^"]+)"/i);
  if (constraint?.[1]) return constraint[1];

  const raised = message.match(
    /\b(permission_denied|seo_reservation_not_releasable|not_authenticated|primary_seo_query_requires_rpc|author_content_mutations_blocked)\b/,
  );
  if (raised?.[1]) return raised[1];

  if (typeof error.code === "string" && error.code.trim()) return error.code.trim();
  return "seo_reservation_release_failed";
}
