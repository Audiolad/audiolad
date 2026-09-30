import { NextResponse } from "next/server";

import { parsePublicContentRevision } from "@/lib/public-content/live-sync";
import { releaseDueScheduledPublications } from "@/lib/products/release-due-scheduled-publications";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET() {
  try {
    await releaseDueScheduledPublications();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("public_content_revision")
      .select("revision")
      .eq("scope", "practices")
      .maybeSingle();

    const revision = error ? null : parsePublicContentRevision(data?.revision);

    if (revision == null) {
      return NextResponse.json({ revision: null }, { status: 503, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ revision }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ revision: null }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
