import type { Metadata } from "next";
import { redirect } from "next/navigation";

import BusinessWorkspace from "@/components/business-app/workspace/BusinessWorkspace";
import { businessMusicRoute } from "@/lib/business-app/point-device";
import { loadPointDeviceVenue } from "@/lib/business-app/point-device.server";
import { buildBusinessAppPageMetadata } from "@/lib/business-app/seo";
import { loadWorkspacePage } from "@/lib/business-workspace/load.server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppPageMetadata(),
  title: "Музыка – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

/**
 * The one music place in the cabinet: the venue player and the upcoming queue.
 * /workspace and /player redirect here. Guests keep the demo at /guest/coffee.
 * This page does not load the catalog twice.
 * A paired venue device (`al-point`) always gets its venue's player here, with or without an
 * account signed in on the browser (the account does not pick the venue).
 */
export default async function BusinessAppMusicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pointDevice = (await loadPointDeviceVenue()) !== null;
  if (businessMusicRoute({ signedIn: Boolean(user), pointDevice }) === "guest") redirect("/guest/coffee");
  const model = await loadWorkspacePage("cafe");
  return <BusinessWorkspace model={model} />;
}
