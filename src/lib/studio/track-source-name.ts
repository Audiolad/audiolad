import type { StudioTrackKind } from "./persistence";

/** Derives a human-facing track name from a local filename or future library title. */
export function getStudioTrackNameFromSourceDisplayName(sourceDisplayName: string): string {
  const displayName = sourceDisplayName.trim();
  const lastDot = displayName.lastIndexOf(".");
  return lastDot > 0 ? displayName.slice(0, lastDot).trim() : displayName;
}

export function isStudioDefaultTrackName(
  name: string,
  trackKind: StudioTrackKind,
): boolean {
  const prefix = trackKind === "voice" ? "Голос" : "Музыка";
  return new RegExp(`^${prefix} \\d+$`).test(name.trim());
}
