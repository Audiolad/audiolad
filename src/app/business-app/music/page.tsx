import type { Metadata } from "next";
import { redirect } from "next/navigation";

import BusinessWorkspace from "@/components/business-app/workspace/BusinessWorkspace";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";
import { loadWorkspacePage } from "@/lib/business-workspace/load.server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Музыка – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

/**
 * The one music place in the cabinet: shelves by author and the venue player.
 * Guests keep the demo at /guest/coffee. This page does not load the catalog twice.
 */
export default async function BusinessAppMusicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/guest/coffee");
  const model = await loadWorkspacePage("cafe");
  return <BusinessWorkspace model={model} />;
}
