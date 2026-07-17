import { NextResponse } from "next/server";

import { loadListenSessionPayload } from "@/lib/listen/load-session-payload";
import { DEFAULT_WELCOME_PRACTICE } from "@/lib/listen/welcome-practice";
import { createClient } from "@/lib/supabase/server";

/**
 * Default listen session for brand-new listeners with no playback history.
 * Never returns signed audio URLs.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loaded = await loadListenSessionPayload(
    supabase,
    DEFAULT_WELCOME_PRACTICE.authorSlug,
    DEFAULT_WELCOME_PRACTICE.practiceSlug,
    user?.id ?? null,
    { forceStartAtBeginning: true },
  );

  if (!loaded.ok) {
    const status =
      loaded.reason === "not_found" || loaded.reason === "no_audio"
        ? 404
        : loaded.reason === "error"
          ? 500
          : 403;

    if (status >= 500) {
      console.error("welcome_session_load_error", loaded.reason);
    }

    return NextResponse.json({ ok: false, reason: loaded.reason }, { status });
  }

  return NextResponse.json({
    ok: true,
    session: {
      ...loaded.session,
      initialProgress: [],
      forceStartAtBeginning: true,
      isWelcomeSession: true,
    },
  });
}
