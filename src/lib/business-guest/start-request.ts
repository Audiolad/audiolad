import { BUSINESS_GUEST_START_COPY as copy } from "./copy";
import { GUEST_START_REDIRECTS } from "./redirects";
import { detectVenueTimezone } from "../business-app/venue-timezones";

/** A start that has not answered by then is treated as lost: the button never stays pending. */
export const GUEST_START_TIMEOUT_MS = 20_000;

export type GuestStartOutcome = { kind: "redirect"; url: string } | { kind: "error"; message: string };

type FetchLike = (input: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Sends the guest start and always settles: a redirect from the allowlist, or a Russian error.
 * A mobile browser can keep a request on a dead connection (tab left open, network changed)
 * without ever failing it, so the whole exchange – headers and body – is bounded by a timeout.
 */
export async function requestGuestStart(body: Record<string, unknown>, options: {
  fetchImpl?: FetchLike; timeoutMs?: number; online?: boolean;
  /** Screen-specific wording (the personal-link entry screen has no gift copy). */
  messages?: { limit?: string; collectionFull?: string; failed?: string };
} = {}): Promise<GuestStartOutcome> {
  const failed = options.messages?.failed ?? copy.failed;
  if (options.online === false) return { kind: "error", message: copy.offline };
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error("guest_start_timeout")); }, options.timeoutMs ?? GUEST_START_TIMEOUT_MS);
  });
  try {
    // The race also settles when a fetch implementation ignores the abort signal.
    return await Promise.race([deadline, (async (): Promise<GuestStartOutcome> => {
      const response = await fetchImpl("/api/business/guest-start", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ timezone: detectVenueTimezone(), ...body }), signal: controller.signal,
      });
      let result: { ok?: unknown; redirect?: unknown; code?: unknown } = {};
      try { result = (await response.json()) ?? {}; } catch { if (timedOut) throw new Error("guest_start_timeout"); }
      if (response.ok && result.ok === true && typeof result.redirect === "string" && GUEST_START_REDIRECTS.includes(result.redirect)) {
        return { kind: "redirect", url: result.redirect };
      }
      if (result.code === "collection_full") return { kind: "error", message: options.messages?.collectionFull ?? failed };
      return { kind: "error", message: response.status === 429 ? options.messages?.limit ?? copy.limit : result.code === "offer_changed" ? copy.offerChanged : failed };
    })()]);
  } catch {
    return { kind: "error", message: timedOut ? copy.timeout : failed };
  } finally {
    clearTimeout(timer);
  }
}
