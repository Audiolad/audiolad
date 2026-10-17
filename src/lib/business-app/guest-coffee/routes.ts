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
  /** Credit 0 = read the server total (ensures the device cookie). null = unavailable. */
  readUsage: () => Promise<number | null>;
  sign: (input: { authorSlug: string; productSlug: string; audioId: string }) => Promise<
    { ok: true; url: string } | { ok: false; reason: string }
  >;
};

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

  const used = await deps.readUsage();
  const limit = guestCoffeeLimitState(used);
  if (limit === "unavailable") return { ok: false, reason: "guest_unavailable", limit };
  // The server refuses new stream URLs once 30 minutes of actual playback are used.
  if (limit === "exhausted") return { ok: false, reason: "no_access", limit };

  const signed = await deps.sign({
    authorSlug: found.playlist.authorSlug,
    productSlug: found.playlist.productSlug,
    audioId: audioItemId,
  });
  if (!signed.ok) {
    const skip = signed.reason === "not_found" || signed.reason === "forbidden" || signed.reason === "access_required" || signed.reason === "audio_missing";
    return { ok: false, reason: skip ? "not_in_manifest" : "sign_failed", limit };
  }
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
