import { createHash } from "node:crypto";
import { BUSINESS_GIFT_MS } from "../business/plan";
import type { GuestStartConfig } from "./start-config";
import { isCurrentBusinessOfferEdition } from "../business/offer";
import { sanitizeBusinessTrialAttribution, type BusinessTrialAttribution } from "../business-trial-attribution/attribution";

export type GuestStartUser = { id: string; is_anonymous?: boolean };
export type GuestStartDeps = {
  config: GuestStartConfig;
  networkHash: () => string | null;
  currentUser: () => Promise<GuestStartUser | null>;
  ready: (userId: string) => Promise<boolean>;
  reserve: (hash: string, limit: number, windowSeconds: number) => Promise<boolean>;
  ticket: () => Promise<string>;
  signIn: (ticket: string) => Promise<GuestStartUser>;
  bootstrap: (input: { userId: string; idempotencyHash: string; networkHash: string; giftSeconds: number; venueName: string | null;
    /** Optional, best-effort source of the start (ch, utm_*, referrer domain). Invalid values become null, never a 400. */
    attribution?: BusinessTrialAttribution | null }) => Promise<void>;
  clearTicket: (userId: string) => Promise<void>;
  /**
   * Records the current договор-оферта edition for the account (idempotent, once per edition).
   * Account-level: also for a registered account that has no Business organization yet.
   */
  acceptOffer: (userId: string) => Promise<void>;
  log: (code: string) => void;
};
export type GuestStartRequest = { method: string; headers: Pick<Headers, "get">; text: () => Promise<string> };
export type GuestStartResponse = { status: number; body: { ok: boolean; redirect?: string; code?: string }; headers: { "Cache-Control": string } };
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleBusinessGuestStart(req: GuestStartRequest, deps: GuestStartDeps): Promise<GuestStartResponse> {
  const response = (status: number, code?: string): GuestStartResponse => ({
    status, body: code ? { ok: false, code } : { ok: true, redirect: "/" }, headers: { "Cache-Control": "no-store" },
  });
  if (!deps.config.enabled) return response(404, "unavailable");
  if (!deps.config.available) return response(503, "unavailable");
  const origins = ["https://coffee.audiolad.ru", "https://business.audiolad.ru"];
  if (!deps.config.production) origins.push("http://localhost:3000");
  const site = req.headers.get("sec-fetch-site");
  if (req.method !== "POST") return response(405, "invalid_request");
  if (!origins.includes(req.headers.get("origin") ?? "") || (site !== null && site !== "same-origin")) return response(403, "invalid_request");
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return response(415, "invalid_request");
  if (Number(req.headers.get("content-length")) > 4096) return response(413, "invalid_request");
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > 4096) return response(413, "invalid_request");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return response(400, "invalid_request");
    body = parsed as Record<string, unknown>;
  } catch { return response(400, "invalid_request"); }
  if (body.accepted !== true || typeof body.idempotencyKey !== "string" || !UUID_V4.test(body.idempotencyKey)) return response(400, "invalid_request");
  if (body.venueName !== undefined && (typeof body.venueName !== "string" || body.venueName.trim().length > 120)) return response(400, "invalid_request");
  // The checkbox accepts exactly the edition linked next to it. A page opened before a new
  // edition was published must be refreshed first, so nobody accepts a text they did not see.
  if (!isCurrentBusinessOfferEdition(body.offerVersion, body.offerHash)) return response(409, "offer_changed");
  const idempotencyHash = createHash("sha256").update(body.idempotencyKey.toLowerCase()).digest("hex");
  try {
    // A failed save is a failed start on every path: the retry records it, so the
    // cabinet never asks again for an edition the owner already ticked.
    let user = await deps.currentUser();
    if (user && user.is_anonymous !== true) { await deps.acceptOffer(user.id); return response(200); }
    if (user && await deps.ready(user.id)) { await deps.acceptOffer(user.id); return response(200); }
    const networkHash = deps.networkHash();
    if (!networkHash) return response(503, "guest_start_failed");
    if (!await deps.reserve(networkHash, deps.config.networkLimit, deps.config.windowSeconds)) return response(429, "guest_start_limit");
    if (!user) {
      user = await deps.signIn(await deps.ticket());
      if (user.is_anonymous !== true) throw new Error("guest_start_failed");
    }
    await deps.bootstrap({ userId: user.id, idempotencyHash, networkHash, giftSeconds: BUSINESS_GIFT_MS / 1000,
      venueName: typeof body.venueName === "string" ? body.venueName.trim() : null,
      attribution: sanitizeBusinessTrialAttribution(body.attribution) });
    // Saved with the gift start, so the cabinet does not ask for the same edition again.
    await deps.acceptOffer(user.id);
    try { await deps.clearTicket(user.id); } catch { deps.log("guest_start_ticket_clear_failed"); }
    return response(200);
  } catch {
    deps.log("guest_start_failed");
    return response(503, "guest_start_failed");
  }
}
