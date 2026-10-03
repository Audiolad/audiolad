export function classicaIndexPath(): string {
  return "/classica";
}

export function classicaWorkPath(composerSlug: string, workSlug: string): string {
  return `/classica/${composerSlug}/${workSlug}`;
}

export function classicaPublicAudioPath(publicId: string): string {
  return `/classica/media/${publicId}/audio`;
}

export const CLASSICA_PUBLIC_BUCKET = "classica-public";
export const CLASSICA_PRODUCTION_BUCKET = "classica-production";

export function classicaPublicStorageUrl(
  storagePath: string | null | undefined,
  supabaseUrl: string | null | undefined,
): string | null {
  const path = storagePath?.trim() ?? "";
  const base = supabaseUrl?.trim().replace(/\/$/, "") ?? "";
  if (!path || !base || path.includes("..")) {
    return null;
  }
  return `${base}/storage/v1/object/public/${CLASSICA_PUBLIC_BUCKET}/${path}`;
}
