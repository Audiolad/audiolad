import type { Metadata } from "next";
import { redirect } from "next/navigation";

import BusinessHallReconnect from "@/components/business-app/BusinessHallReconnect";
import BusinessWorkspace from "@/components/business-app/workspace/BusinessWorkspace";
import { loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { businessMusicRoute } from "@/lib/business-app/point-device";
import { loadPointDeviceVenue } from "@/lib/business-app/point-device.server";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { buildNamedBusinessPageMetadata } from "@/lib/business-app/seo";
import { loadWorkspacePage } from "@/lib/business-workspace/load.server";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildNamedBusinessPageMetadata(getHostnameFromHeaders(await headers()), "Музыка");
}

/**
 * The one music place in the cabinet: the venue player and the upcoming queue.
 * /workspace and /player redirect here. Guests keep the demo at /guest/coffee.
 * This page does not load the catalog twice.
 * A paired venue device (`al-point`) always gets its venue's player here, with or without an
 * account signed in on the browser (the account does not pick the venue). A hall device whose
 * venue cannot be read (revoked or unchecked cookie) gets the reconnect screen, never the guest demo.
 */
export default async function BusinessAppMusicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pointDevice = (await loadPointDeviceVenue()) !== null;
  // Any device cookie (alive, revoked or unchecked) keeps this browser the hall: never the guest demo.
  const cabinet = await loadBusinessCabinetMode();
  const route = businessMusicRoute({
    signedIn: Boolean(user),
    pointDevice,
    hallDevice: cabinet.pointAlive,
    hallLocked: cabinet.mode === "point",
  });
  if (route === "guest") redirect("/guest/coffee");
  if (route === "hall_reconnect") return <BusinessHallReconnect revoked={cabinet.deviceStatus === "revoked"} />;
  const model = await loadWorkspacePage("cafe");
  return <BusinessWorkspace model={model} />;
}
