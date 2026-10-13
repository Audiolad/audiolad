import { notFound } from "next/navigation";

// Stage 1 (Sergey 2026-10-13): online player. The offline SpaPilotPlayer is deferred, not deleted.
import SpaOnlinePlayer from "@/components/business-app/SpaOnlinePlayer";
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
    <SpaOnlinePlayer programName={ctx.programName} initialManifest={manifest} />
  );
}
