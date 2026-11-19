import { bindPersonalCollection, collectionHasRoom, collectionVisitorStrict, loadCollectionPermission, ownerCafeVenueCollections } from "@/lib/business-collections/load.server";
import { COLLECTION_ENTRY_HEADER } from "@/lib/business-collections/entry";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { VENUE_TIMEZONE_DEFAULT_ID } from "@/lib/business-app/venue-timezones";
import { issueBusinessGuestStartTicket } from "@/lib/auth/business-guest/ticket.server";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { businessGuestStartConfig } from "@/lib/business-guest/start-config";
import { guestNetworkKey } from "@/lib/business-guest/network-key";
import { handleBusinessGuestStart } from "@/lib/business-guest/start";
import { businessStartHost } from "@/lib/business-trial-activity/config";
import { recordBusinessGuestStartHost } from "@/lib/business-trial-activity/record.server";
import { recordBusinessGuestStartAttribution } from "@/lib/business-trial-attribution/record.server";
import { hostnameFromHeaders } from "@/lib/supabase/cookie-domain";
import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import { BUSINESS_OFFER_EDITION, currentBusinessOfferEdition, isNotOfferPartyError } from "@/lib/business/offer";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bound the stream before decoding even if Content-Length is absent or forged.
async function boundedText(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return " ".repeat(4097); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function handle(request: Request) {
  // A new venue starts from a phone, never from the hall device (cabinet-mode.ts): no sign-in,
  // no bootstrap side effects there.
  if (await businessHallDeviceLocked()) {
    return NextResponse.json({ ok: false, reason: "venue_device" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const config = businessGuestStartConfig(process.env);
  // t1616u: any start in a browser that holds a personal link (or by an account bound to one) is a
  // collection start and fails closed. The link must still be live and have a free place (at most
  // COLLECTION_ACCOUNT_LIMIT accounts); no venue of the account may hold another collection; the
  // account is bound BEFORE its venue is created, so the venue inherits the collection in the same
  // transaction; after the start every cafe venue of the account must hold this collection.
  // It never ends as an ordinary guest with the whole catalog.
  const collectionEntry = request.headers.get(COLLECTION_ENTRY_HEADER) === "1";
  let entryCollectionId: string | null = null;
  let startedUserId: string | null = null;
  const json = (status: number, code: string, headers: Record<string, string> = { "Cache-Control": "no-store" }) =>
    NextResponse.json({ ok: false, code }, { status, headers });
  if (config.enabled && request.method === "POST") {
    try {
      const permission = await loadCollectionPermission();
      const { data: { user } } = await (await createClient()).auth.getUser();
      // A revoked link (cookie in this browser or an account once bound to a collection) never
      // becomes an ordinary start with the whole catalog.
      if (!permission && (collectionEntry || await collectionVisitorStrict(user?.id ?? null))) return json(410, "collection_unavailable");
      if (permission) {
        entryCollectionId = permission.id;
        if (!await collectionHasRoom(permission.id, user?.id ?? null)) return json(409, "collection_full");
        if (user && (await ownerCafeVenueCollections(user.id)).some((venue) => venue.collectionId !== null && venue.collectionId !== permission.id)) {
          return json(409, "collection_other");
        }
      }
    } catch {
      return json(503, "guest_start_failed");
    }
  }
  // Lazy clients keep the disabled path independent of Auth and service credentials.
  const session = () => createClient();
  const result = await handleBusinessGuestStart({ method: request.method, headers: request.headers, text: () => boundedText(request) }, {
    config,
    networkHash: () => guestNetworkKey(getTrustedClientIp(request), config.networkSecret),
    currentUser: async () => {
      const { data, error } = await (await session()).auth.getUser();
      if (error && error.name !== "AuthSessionMissingError") throw new Error("guest_start_failed");
      startedUserId = data.user?.id ?? null;
      return data.user;
    },
    ready: async (userId) => {
      const { data, error } = await createServiceRoleClient().from("business_guest_starts").select("id").eq("user_id", userId).eq("status", "ready").maybeSingle();
      if (error) throw new Error("guest_start_failed");
      return Boolean(data);
    },
    reserve: async (hash, limit, seconds) => {
      const { data, error } = await createServiceRoleClient().rpc("business_guest_start_reserve", { p_network_hash: hash, p_limit: limit, p_window_seconds: seconds });
      if (error || typeof data !== "boolean") throw new Error("guest_start_failed");
      return data;
    },
    ticket: issueBusinessGuestStartTicket,
    signIn: async (ticket) => {
      const { data, error } = await (await session()).auth.signInAnonymously({ options: { data: { business_guest_ticket: ticket } } });
      if (error || !data.user) throw new Error("guest_start_failed");
      return data.user;
    },
    bootstrap: async (input) => {
      startedUserId = input.userId;
      // Bound first: the venue the bootstrap creates inherits the collection (location trigger).
      if (entryCollectionId && !await bindPersonalCollection(entryCollectionId, input.userId)) throw new Error("collection_full");
      const { data, error } = await createServiceRoleClient().rpc("business_guest_bootstrap", {
        p_user_id: input.userId, p_idempotency_hash: input.idempotencyHash, p_network_hash: input.networkHash,
        p_gift_seconds: input.giftSeconds, p_venue_name: input.venueName,
      });
      if (error || !Array.isArray(data) || !data[0]?.organization_id || !data[0]?.location_id) throw new Error("guest_start_failed");
      // First setup only (created = true): the venue gets the browser's zone mapped to one of the
      // 11 Russian zones. The SQL default stays Moscow; an existing venue is never touched here.
      if (data[0].created === true && input.timezone && input.timezone !== VENUE_TIMEZONE_DEFAULT_ID) {
        const { error: tzError } = await createServiceRoleClient().from("business_locations")
          .update({ timezone: input.timezone }).eq("id", data[0].location_id).eq("organization_id", data[0].organization_id);
        if (tzError) console.warn("guest_start_timezone_failed");
      }
      // Gift-week stats (flag OFF by default): coffee or business host only, never the raw Host.
      await recordBusinessGuestStartHost(input.userId, businessStartHost(hostnameFromHeaders(request.headers)));
      // Gift-week source (flag OFF by default): city from the IP in memory, device family from the
      // User-Agent, ch/utm_*/referrer domain from the body. Neither the IP nor the raw UA is stored.
      await recordBusinessGuestStartAttribution(input.userId, {
        attribution: input.attribution ?? null,
        ip: getTrustedClientIp(request),
        userAgent: request.headers.get("user-agent"),
      });
    },
    clearTicket: async (userId) => {
      const { error } = await createServiceRoleClient().auth.admin.updateUserById(userId, { user_metadata: { business_guest_ticket: null } });
      if (error) throw new Error("guest_start_ticket_clear_failed");
    },
    acceptOffer: async (userId) => {
      // userId comes from the session above, never from the body. Idempotent per edition.
      const annex = currentBusinessOfferEdition(isUnifiedAgreementEnabled());
      const { error } = await createServiceRoleClient().rpc("record_business_offer_edition_acceptance", {
        p_user_id: userId,
        p_document_version: BUSINESS_OFFER_EDITION.version,
        p_content_hash: BUSINESS_OFFER_EDITION.contentHash,
        p_annex_version: annex.version,
        p_annex_hash: annex.contentHash,
        p_source: "guest_start",
      });
      if (error && isNotOfferPartyError(error)) return "not_party";
      if (error) throw new Error("guest_start_offer_accept_failed");
      return "recorded";
    },
    log: (code) => console.warn(code),
  });
  if (result.body.ok && entryCollectionId) {
    try {
      // Fail closed: the account (also an already started one) holds the collection, and every cafe
      // venue it owns plays exactly this collection.
      if (!startedUserId || !await bindPersonalCollection(entryCollectionId, startedUserId)) {
        return json(409, "collection_full", result.headers);
      }
      const venues = await ownerCafeVenueCollections(startedUserId);
      if (venues.some((venue) => venue.collectionId !== entryCollectionId)) return json(503, "guest_start_failed", result.headers);
    } catch { return json(503, "guest_start_failed", result.headers); }
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
export const POST = handle;
export const GET = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
