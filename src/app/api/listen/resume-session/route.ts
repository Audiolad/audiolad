import { NextResponse } from "next/server";

import { loadListenSessionPayload } from "@/lib/listen/load-session-payload";
import { createClient } from "@/lib/supabase/server";

type ProgressRow = {
  practice_id: string;
  updated_at: string;
};

type PracticeRow = {
  slug: string;
  authors: { slug: string } | { slug: string }[] | null;
};

/**
 * Resume the user's most recently listened practice for desktop player restore.
 * Re-checks access. Never returns signed audio URLs.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  const { data: progressRows, error: progressError } = await supabase
    .from("practice_audio_progress")
    .select("practice_id, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (progressError || !progressRows?.length) {
    return NextResponse.json({ ok: false, reason: "no_history" }, { status: 404 });
  }

  const latest = progressRows[0] as ProgressRow;

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("slug, authors!practices_author_id_fkey (slug)")
    .eq("id", latest.practice_id)
    .maybeSingle();

  if (practiceError || !practice) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const practiceRow = practice as PracticeRow;
  const author = Array.isArray(practiceRow.authors)
    ? practiceRow.authors[0]
    : practiceRow.authors;
  const authorSlug = author?.slug?.trim();
  const productSlug = practiceRow.slug?.trim();

  if (!authorSlug || !productSlug) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const loaded = await loadListenSessionPayload(
    supabase,
    authorSlug,
    productSlug,
    user.id,
  );

  if (!loaded.ok) {
    const status =
      loaded.reason === "not_found"
        ? 404
        : loaded.reason === "error"
          ? 500
          : 403;

    return NextResponse.json({ ok: false, reason: loaded.reason }, { status });
  }

  return NextResponse.json({
    ok: true,
    session: loaded.session,
  });
}
