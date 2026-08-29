import { NextResponse } from "next/server";

import { loadAuthorOnboardingChecklistState } from "@/lib/author-dashboard/load-onboarding-state";
import { hideAuthorOnboardingChecklist } from "@/lib/author-dashboard/onboarding-ui-store";
import {
  parseOnboardingUiHideBody,
  resolveOnboardingHideDecision,
} from "@/lib/author-dashboard/onboarding-ui-state";
import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";

export async function PATCH(request: Request) {
  try {
    const parsed = parseOnboardingUiHideBody(await request.json().catch(() => null));

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { authorId, checklist: checklistKind } = parsed;
    const { supabase, accessStatus } = await requireAuthorMembership(authorId);

    const { data: author, error } = await supabase
      .from("authors")
      .select("id, slug")
      .eq("id", authorId)
      .maybeSingle();

    if (error) {
      console.error("author_onboarding_ui_author_lookup_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!author?.id || !author.slug) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const checklist = await loadAuthorOnboardingChecklistState(supabase, {
      authorId: author.id,
      authorSlug: author.slug,
      accessStatus,
    });

    const complete =
      checklistKind === "free"
        ? checklist.complete
        : checklist.commercial.complete;
    const decision = resolveOnboardingHideDecision({ complete });

    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error },
        { status: decision.status },
      );
    }

    const ui = await hideAuthorOnboardingChecklist({
      authorId: author.id,
      checklist: checklistKind,
      freeComplete: checklist.complete,
      commercialComplete: checklist.commercial.complete,
    });

    return NextResponse.json({ ok: true, ui, checklist });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
