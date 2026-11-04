import { NextResponse } from "next/server";

import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import {
  BUSINESS_OFFER_EDITION,
  BUSINESS_OFFER_HREF,
  currentBusinessOfferEdition,
  isCurrentBusinessOfferEdition,
} from "@/lib/business/offer";
import { mapBusinessSubscriptionRpcError } from "@/lib/business/subscription-checkout";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export const dynamic = "force-dynamic";

async function shownEditionIsCurrent(request: Request): Promise<boolean> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // An empty body accepts the edition published now (older cabinet pages).
    return true;
  }
  if (!body || typeof body !== "object") return true;
  const { offerVersion, offerHash } = body as { offerVersion?: unknown; offerHash?: unknown };
  if (offerVersion === undefined && offerHash === undefined) return true;
  return isCurrentBusinessOfferEdition(offerVersion, offerHash);
}

/**
 * One acceptance per account and offer edition: the договор-оферта shown next to the
 * button (/documents/business-offer). It also records annex 1 for the payment gate.
 * The same edition is never asked twice.
 */
export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (await businessHallDeviceLocked()) {
    return NextResponse.json({ error: "venue_device" }, { status: 403 });
  }
  if (!(await shownEditionIsCurrent(request))) {
    return NextResponse.json({ error: "offer_acceptance_required", href: BUSINESS_OFFER_HREF }, { status: 409 });
  }

  const annex = currentBusinessOfferEdition(isUnifiedAgreementEnabled());
  const { data, error } = await supabase.rpc("accept_business_offer_edition", {
    p_document_key: BUSINESS_OFFER_EDITION.documentKey,
    p_document_version: BUSINESS_OFFER_EDITION.version,
    p_content_hash: BUSINESS_OFFER_EDITION.contentHash,
    p_annex_version: annex.version,
    p_annex_hash: annex.contentHash,
  });

  if (error) {
    const mapped = mapBusinessSubscriptionRpcError(error.message);
    return NextResponse.json(
      { error: mapped.error, ...(mapped.href ? { href: mapped.href } : {}) },
      { status: mapped.status },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, accepted: true });
}
