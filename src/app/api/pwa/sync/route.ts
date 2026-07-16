import { NextResponse } from "next/server";

import { PWA_PLATFORM_VALUES, type PwaPlatform } from "@/lib/pwa/constants";
import { createClient } from "@/lib/supabase/server";

type PwaSyncBody = {
  action?: unknown;
  platform?: unknown;
};

function parseBody(body: unknown): PwaSyncBody | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  return body as PwaSyncBody;
}

function sanitizePlatform(value: unknown): PwaPlatform | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim() as PwaPlatform;

  return PWA_PLATFORM_VALUES.includes(trimmed) ? trimmed : null;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseBody(body);
  const action = typeof parsed?.action === "string" ? parsed.action.trim() : "";
  const platform = sanitizePlatform(parsed?.platform);

  if (action !== "installed" && action !== "standalone_open") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {
    pwa_last_standalone_opened_at: now,
  };

  if (action === "installed") {
    patch.pwa_installed_at = now;
    patch.pwa_install_platform = platform;
  } else if (platform) {
    patch.pwa_install_platform = platform;
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);

  if (error) {
    console.error("pwa_sync_profile_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
