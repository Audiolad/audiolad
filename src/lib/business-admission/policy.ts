/** Manual style decisions only. Analyzer scores never enter this resolver. */
export type ManualAdmission = { allowed: boolean | null };
export type AdmissionSource = "artist" | "album" | "unreviewed";
export function resolveManualAdmission(
  artist: ManualAdmission | null | undefined,
  album: ManualAdmission | null | undefined,
): { allowed: boolean; source: AdmissionSource } {
  if (typeof album?.allowed === "boolean") return { allowed: album.allowed, source: "album" };
  if (typeof artist?.allowed === "boolean") return { allowed: artist.allowed, source: "artist" };
  return { allowed: false, source: "unreviewed" };
}
export const ADMISSION_SOURCE_LABELS: Record<AdmissionSource, string> = {
  artist: "артист", album: "альбом", unreviewed: "не проверено",
};
