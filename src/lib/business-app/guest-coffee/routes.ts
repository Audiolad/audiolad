/**
 * a8240527 — request handling of the guest coffee routes, with every dependency injected
 * so the gate (shelf membership → server limit → canonical signing) is unit-tested.
 */
import { findGuestCoffeeTrack, type GuestCoffeePlaylist } from "./catalog";
import { clampGuestCoffeeCredit, guestCoffeeLimitState, type GuestCoffeeLimitState } from "./limit";

export type GuestCoffeeTrackUrlResult =
  | { ok: true; data: { url: string }; limit: GuestCoffeeLimitState }
  | { ok: false; reason: string; limit?: GuestCoffeeLimitState };

export type GuestCoffeeTrackUrlDeps = {
  loadShelf: () => Promise<GuestCoffeePlaylist[]>;
  /**
   * Fresh (uncached) check right before signing: the album is still published, listed
   * and FREE. The shelf is cached for minutes; the canonical signer alone would also allow
   * paid products with guest access, so this re-check is what keeps paid audio out.
   */
  isStillFree: (playlist: GuestCoffeePlaylist) => Promise<boolean>;
  /** Read-only server total (no lease, no charge) — skip signing when already exhausted. */
  peekUsage: () => Promise<number | null>;
  /**
   * Server meter, called only AFTER signing succeeded: settle the previous playback lease
   * and open (and charge) one for this track unless the limit is used up.
   * Returns effective used seconds; null = unavailable.
   */
  issueLease: (trackSeconds: number) => Promise<number | null>;
  sign: (input: { authorSlug: string; productSlug: string; audioId: string }) => Promise<
    { ok: true; url: string } | { ok: false; reason: string }
  >;
};

/** Lease length the server may charge for one issued track (unknown length → 5 min). */
export function guestCoffeeLeaseSeconds(durationSeconds: number | null | undefined): number {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 300;
  return Math.min(900, Math.max(1, Math.ceil(durationSeconds)));
}

export function parseGuestCoffeeAudioItemId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { audioItemId?: unknown }).audioItemId;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

export async function handleGuestCoffeeTrackUrl(
  body: unknown,
  deps: GuestCoffeeTrackUrlDeps,
): Promise<GuestCoffeeTrackUrlResult> {
  const audioItemId = parseGuestCoffeeAudioItemId(body);
  if (!audioItemId) return { ok: false, reason: "invalid_request" };

  // Only tracks of the curated, currently playable free albums — never an arbitrary id.
  const found = findGuestCoffeeTrack(await deps.loadShelf(), audioItemId);
  if (!found) return { ok: false, reason: "not_in_manifest" };

  if (!(await deps.isStillFree(found.playlist))) return { ok: false, reason: "not_in_manifest" };

  // 1. Cheap read-only gate: no signing for a guest whose limit is already used up.
  const before = guestCoffeeLimitState(await deps.peekUsage());
  if (before === "unavailable") return { ok: false, reason: "guest_unavailable", limit: before };
  if (before === "exhausted") return { ok: false, reason: "no_access", limit: before };

  // 2. Sign first: a failed signing never opens or charges a lease.
  const signed = await deps.sign({
    authorSlug: found.playlist.authorSlug,
    productSlug: found.playlist.productSlug,
    audioId: audioItemId,
  });
  if (!signed.ok) {
    const skip = signed.reason === "not_found" || signed.reason === "forbidden" || signed.reason === "access_required" || signed.reason === "audio_missing";
    return { ok: false, reason: skip ? "not_in_manifest" : "sign_failed", limit: before };
  }

  // 3. Authoritative, atomic authorisation + charge. The URL is returned only if it passes;
  //    otherwise the freshly signed URL is simply discarded.
  const limit = guestCoffeeLimitState(await deps.issueLease(guestCoffeeLeaseSeconds(found.track.durationSeconds)));
  if (limit === "unavailable") return { ok: false, reason: "guest_unavailable", limit };
  // The server refuses new stream URLs once 30 minutes of playback are used.
  if (limit === "exhausted") return { ok: false, reason: "no_access", limit };
  return { ok: true, data: { url: signed.url }, limit };
}

export type GuestCoffeeUsageResult =
  | { ok: true; limit: GuestCoffeeLimitState }
  | { ok: false; reason: string; limit?: GuestCoffeeLimitState };

export async function handleGuestCoffeeUsage(
  body: unknown,
  credit: (seconds: number) => Promise<number | null>,
): Promise<GuestCoffeeUsageResult> {
  const seconds = clampGuestCoffeeCredit(
    body && typeof body === "object" ? (body as { seconds?: unknown }).seconds : undefined,
  );
  if (seconds === null) return { ok: false, reason: "invalid_request" };
  const used = await credit(seconds);
  const limit = guestCoffeeLimitState(used);
  if (limit === "unavailable") return { ok: false, reason: "guest_unavailable", limit };
  return { ok: true, limit };
}
