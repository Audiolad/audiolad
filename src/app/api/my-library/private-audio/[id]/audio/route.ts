import { NextResponse } from "next/server";

import { requirePrivateAudioUser } from "@/lib/private-audio/server/access";
import {
  handlePrivateAudioRouteError,
  privateNoStoreHeaders,
} from "@/lib/private-audio/server/errors";
import { getOwnedPrivateAudioItem } from "@/lib/private-audio/server/repository";
import { createSignedPrivateAudioUrl } from "@/lib/private-audio/server/signed-urls";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const { id } = await context.params;

    // Ownership gate before signing (neutral not_found for strangers).
    const item = await getOwnedPrivateAudioItem(user.id, id);
    const signed = await createSignedPrivateAudioUrl(item.audio_path);

    return NextResponse.json(signed, { headers: privateNoStoreHeaders() });
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}
