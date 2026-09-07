/**
 * Course PDF/file learner opens must stay on the authenticated protected
 * route. A real document navigation (new tab) should receive the file;
 * XHR/fetch callers still get the JSON contract.
 */
export function wantsProtectedFileDocumentOpen(request: Request): boolean {
  const dest = request.headers.get("sec-fetch-dest")?.trim().toLowerCase();
  if (dest === "document" || dest === "iframe" || dest === "embed") {
    return true;
  }

  const mode = request.headers.get("sec-fetch-mode")?.trim().toLowerCase();
  if (mode === "navigate") {
    return true;
  }

  const accept = request.headers.get("accept") ?? "";
  const prefersJson = accept.includes("application/json");
  const prefersHtml = accept.includes("text/html");
  return prefersHtml && !prefersJson;
}

export function buildCourseLearnerFilePath(
  authorSlug: string,
  productSlug: string,
  fileId: string,
): string {
  return `/api/listen/product/${encodeURIComponent(authorSlug)}/${encodeURIComponent(productSlug)}/file/${encodeURIComponent(fileId)}`;
}
