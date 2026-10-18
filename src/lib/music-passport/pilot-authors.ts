/**
 * Music passport pilot allowlist (author cabinet product wizard step 2).
 *
 * 18.10.2026 (Sergey): Aurafon gets the same passport flow as Jazz Relax,
 * including «Продолжить без музыкального паспорта», so it is never blocked.
 * Gate decisions use UUID only – never display name or slug.
 * The Analyzer itself is unchanged; Candidate A stays off.
 */
import { AURAFON_AUTHOR_ID, isAurafonAuthor } from "@/lib/authors/aurafon";
import { JAZZ_RELAX_AUTHOR_ID, isJazzRelaxAuthor } from "@/lib/authors/jazz-relax";

export const MUSIC_PASSPORT_PILOT_AUTHOR_IDS: readonly string[] = [
  JAZZ_RELAX_AUTHOR_ID,
  AURAFON_AUTHOR_ID,
];

/** True only for allowlisted author workspace UUIDs (Jazz Relax, Aurafon). */
export function isMusicPassportPilotAuthor(
  authorId: string | null | undefined,
): boolean {
  return isJazzRelaxAuthor(authorId) || isAurafonAuthor(authorId);
}
