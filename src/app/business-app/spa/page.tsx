import { notFound } from "next/navigation";

import SpaPilotPlayer from "@/components/business-app/SpaPilotPlayer";
import { fetchSpaManifestRaw, loadSpaPilotContext } from "@/lib/business-app/spa-pilot";

export const dynamic = "force-dynamic";

export default async function BusinessSpaPilotPage() {
  const ctx = await loadSpaPilotContext();
  // Not logged in / not on the pilot allowlist: the page does not exist for them.
  if (!ctx) notFound();
  let manifest: unknown = null;
  try {
    manifest = await fetchSpaManifestRaw(ctx);
  } catch {
    manifest = null;
  }
  return (
    <SpaPilotPlayer
      programId={ctx.programId}
      programName={ctx.programName}
      initialManifest={manifest}
      playerId={ctx.playerId}
      zoneId={ctx.zoneId}
    />
  );
}
