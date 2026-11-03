import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
  // Lazy clients keep the disabled path independent of Auth and service credentials.
  const session = () => createClient();
  const result = await handleBusinessGuestStart({ method: request.method, headers: request.headers, text: () => boundedText(request) }, {
    config,
    networkHash: () => guestNetworkKey(getTrustedClientIp(request), config.networkSecret),
    currentUser: async () => {
      const { data, error } = await (await session()).auth.getUser();
      if (error && error.name !== "AuthSessionMissingError") throw new Error("guest_start_failed");
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
      const { data, error } = await createServiceRoleClient().rpc("business_guest_bootstrap", {
        p_user_id: input.userId, p_idempotency_hash: input.idempotencyHash, p_network_hash: input.networkHash,
        p_gift_seconds: input.giftSeconds, p_venue_name: input.venueName,
      });
      if (error || !Array.isArray(data) || !data[0]?.organization_id || !data[0]?.location_id) throw new Error("guest_start_failed");
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
    log: (code) => console.warn(code),
  });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
export const POST = handle;
export const GET = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
