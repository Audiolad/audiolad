"use client";

import { useRef, useState } from "react";
import { requestGuestStart } from "@/lib/business-guest/start-request";
import { BUSINESS_OFFER_EDITION } from "@/lib/business/offer";
import { BUSINESS_OFFER_LINK_ATTR, BusinessOfferDocumentLink } from "@/components/business-app/BusinessOfferDocumentLink";
import { BusinessPrivacyDocumentLink } from "@/components/business-app/BusinessPrivacyDocumentLink";
import { COLLECTION_ENTRY_COPY as copy, COLLECTION_ENTRY_HEADER, collectionEntryDestination } from "@/lib/business-collections/entry";

const STORAGE_KEY = "audiolad.business.collection-start.v1";

/**
 * Calm entry to the ordinary coffee app by a personal link (t1616u–t1618u): one button, the
 * account-level acceptance of the offer under it, no gift, price or countdown. The start is the
 * ordinary guest start; the collection is bound on the server from the link cookie.
 */
export default function CollectionEntry() {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const key = useRef<string | null>(null);

  async function open() {
    if (!accepted || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    let navigating = false;
    try {
      if (!key.current) {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        key.current = stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored) ? stored : crypto.randomUUID();
        sessionStorage.setItem(STORAGE_KEY, key.current);
      }
      const outcome = await requestGuestStart(
        { accepted: true, offerVersion: BUSINESS_OFFER_EDITION.version, offerHash: BUSINESS_OFFER_EDITION.contentHash, idempotencyKey: key.current },
        { online: typeof navigator === "undefined" ? undefined : navigator.onLine, messages: { limit: copy.limit, collectionFull: copy.full, collectionUnavailable: copy.gone, failed: copy.failed },
          headers: { [COLLECTION_ENTRY_HEADER]: "1" } },
      );
      if (outcome.kind === "redirect") {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
        key.current = null;
        navigating = true;
        // Full load: the layout reads the new session and opens the music with the collection.
        window.location.assign(collectionEntryDestination(outcome.url));
        window.setTimeout(() => setLoading(false), 20_000);
        return;
      }
      setError(outcome.message);
    } catch { setError(copy.failed); }
    finally {
      busy.current = false;
      if (!navigating) setLoading(false);
    }
  }

  return <div className="space-y-4" data-testid="collection-entry">
    <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring"
      disabled={!accepted || loading} aria-busy={loading} onClick={open} data-testid="collection-open">
      {loading ? copy.loading : error ? copy.retry : copy.open}
    </button>
    <label className="flex items-start gap-2 text-sm text-[var(--biz-text-muted)]">
      <input type="checkbox" checked={accepted} disabled={loading} onChange={(event) => setAccepted(event.target.checked)} data-testid="collection-accept" />
      <span>{copy.acceptance}</span>
    </label>
    <p className="text-sm text-[var(--biz-text-muted)]">
      <BusinessOfferDocumentLink testId="collection-offer-link" className={BUSINESS_OFFER_LINK_ATTR} /> ({BUSINESS_OFFER_EDITION.label}){" · "}
      <BusinessPrivacyDocumentLink testId="collection-privacy-link" className={BUSINESS_OFFER_LINK_ATTR} />
    </p>
    {error ? <p role="alert" data-testid="collection-error">{error}</p> : null}
  </div>;
}
