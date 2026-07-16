import { NextResponse } from "next/server";

import {
  isPromoClaimRpcResult,
  mapPromoClaimRpcErrorMessage,
  parsePromoCompleteSignupBody,
} from "@/lib/promo/complete-signup-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("promo_complete_signup_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parsePromoCompleteSignupBody(body);

  if (!parsed) {
    console.warn("promo_complete_signup_invalid_body");
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("claim_promo_practice", {
    p_practice_slug: parsed.practice_slug,
    p_practice_id: parsed.practice_id ?? null,
  });

  if (error) {
    const mapped = mapPromoClaimRpcErrorMessage(error.message);

    if (mapped.status >= 500) {
      console.error("promo_complete_signup_claim_error", {
        code: error.code,
        message: error.message,
        practiceSlug: parsed.practice_slug,
        hasPracticeId: Boolean(parsed.practice_id),
      });
    } else {
      console.warn("promo_complete_signup_claim_rejected", {
        status: mapped.status,
        error: mapped.error,
        practiceSlug: parsed.practice_slug,
        hasPracticeId: Boolean(parsed.practice_id),
      });
    }

    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  if (!isPromoClaimRpcResult(data)) {
    console.error("promo_complete_signup_claim_empty_result", {
      practiceSlug: parsed.practice_slug,
      hasPracticeId: Boolean(parsed.practice_id),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let progressTransferred = false;

  if (parsed.progress) {
    const { error: progressError } = await supabase
      .from("practice_audio_progress")
      .upsert(
        {
          user_id: user.id,
          practice_id: data.practice_id,
          audio_item_id: parsed.progress.audio_item_id,
          position_seconds: parsed.progress.position_seconds,
          completed: parsed.progress.completed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,practice_id,audio_item_id" },
      );

    if (progressError) {
      console.error("promo_complete_signup_progress_error", {
        message: progressError.message,
        practiceId: data.practice_id,
      });
    } else {
      progressTransferred = true;
    }
  }

  await supabase.rpc("insert_analytics_event", {
    p_event_name: "promo_signup_completed",
    p_practice_id: data.practice_id,
    p_track_id: parsed.progress?.audio_item_id ?? null,
    p_anonymous_session_id: null,
    p_utm_source: null,
    p_utm_medium: null,
    p_utm_campaign: null,
    p_utm_content: null,
    p_referrer: null,
    p_current_position: parsed.progress?.position_seconds ?? null,
    p_duration: null,
    p_payload: {},
  });

  if (data.inserted) {
    await supabase.rpc("insert_analytics_event", {
      p_event_name: "promo_practice_saved",
      p_practice_id: data.practice_id,
      p_track_id: parsed.progress?.audio_item_id ?? null,
      p_anonymous_session_id: null,
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
      p_utm_content: null,
      p_referrer: null,
      p_current_position: null,
      p_duration: null,
      p_payload: {},
    });
  }

  console.info("promo_complete_signup_success", {
    practiceId: data.practice_id,
    practiceSlug: data.practice_slug,
    inserted: data.inserted,
    progressTransferred,
  });

  return NextResponse.json(
    {
      ok: true,
      practiceSaved: true,
      alreadySaved: !data.inserted,
      progressTransferred,
      library: {
        practice_id: data.practice_id,
        practice_slug: data.practice_slug,
        access_source: data.access_source,
        inserted: data.inserted,
        in_library: true,
      },
    },
    { status: data.inserted ? 201 : 200 },
  );
}
