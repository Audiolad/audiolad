import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";

import { decideMusicLabAccess } from "@/lib/music-lab/access-policy";
import { MUSIC_LAB_ROUTE } from "@/lib/music-lab/constants";
import { getPlatformAccess } from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";

export type MusicLabActor = {
  userId: string;
  email: string | null;
  roles: readonly string[];
};

export function musicLabNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

export async function resolveMusicLabAccess(): Promise<{
  decision: ReturnType<typeof decideMusicLabAccess>;
  actor: MusicLabActor | null;
}> {
  const actor = await loadActor();
  return {
    actor,
    decision: decideMusicLabAccess({
      userId: actor?.userId ?? null,
      roles: actor?.roles ?? [],
    }),
  };
}

async function loadActor(): Promise<MusicLabActor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const access = await getPlatformAccess(supabase, user.id);
  return {
    userId: user.id,
    email: user.email ?? null,
    roles: access.roles,
  };
}

/**
 * Page gate. Anonymous users are sent to sign-in and never receive lab HTML.
 * Signed-in users outside owner/admin get the platform 404, same as a hidden admin section.
 */
export async function requireMusicLabPageAccess(): Promise<MusicLabActor> {
  const { actor, decision } = await resolveMusicLabAccess();

  if (decision === "anonymous") {
    redirect(`/auth/sign-in?next=${MUSIC_LAB_ROUTE}`);
  }

  if (decision !== "allow" || !actor) {
    notFound();
  }

  return actor;
}

export async function requireMusicLabApiAccess(): Promise<
  { ok: true; actor: MusicLabActor } | { ok: false; response: NextResponse }
> {
  const { actor, decision } = await resolveMusicLabAccess();

  if (decision === "anonymous") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: musicLabNoStoreHeaders() },
      ),
    };
  }

  if (decision !== "allow" || !actor) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: musicLabNoStoreHeaders() },
      ),
    };
  }

  return { ok: true, actor };
}
