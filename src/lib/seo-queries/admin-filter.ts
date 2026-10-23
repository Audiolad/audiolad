export const SEO_UNCHECKED_ADMIN_HREF = "/admin/seo-queries?analysis=not_analyzed";

export function parseSeoAnalysisFilterParam(value: unknown): "" | "not_analyzed" | "analyzed" | "not_applicable" {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "not_analyzed" || first === "analyzed" || first === "not_applicable" ? first : "";
}
