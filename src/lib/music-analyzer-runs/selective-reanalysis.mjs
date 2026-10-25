import { createHash } from "node:crypto";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** @param {unknown} value */
export function reanalysisSelection(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10 || value.some(v => typeof v !== "string" || !UUID.test(v))) throw new Error("invalid_selection");
  return [...new Set(value.map(v => v.toLowerCase()))];
}
/** Стабильный UUID на повтор HTTP-запроса; новый requestId означает новый прогон.
 * @param {string} requestId @param {string} sourceId
 */
export function reanalysisId(requestId, sourceId) {
  if (!UUID.test(requestId) || !UUID.test(sourceId)) throw new Error("invalid_selection");
  const hex = createHash("sha256").update(`reanalyze:1:${requestId.toLowerCase()}:${sourceId.toLowerCase()}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
