import { NextResponse } from "next/server";

import { currentBusinessOfferEdition } from "@/lib/business/offer";
import { mapBusinessSubscriptionRpcError } from "@/lib/business/subscription-checkout";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export const dynamic = "force-dynamic";

/** One acceptance per account. The text is the offer already published on this site. */
export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const edition = currentBusinessOfferEdition(isUnifiedAgreementEnabled());
  const { data, error } = await supabase.rpc("accept_business_offer", {
    p_document_key: edition.documentKey,
    p_document_version: edition.version,
    p_content_hash: edition.contentHash,
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
