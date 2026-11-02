"use client";

import { useRef, useState, type ReactNode } from "react";
import { useGuestStartEnabled } from "./BusinessDomainProvider";
import { BUSINESS_GUEST_START_COPY as copy } from "@/lib/business-guest/copy";
import { BUSINESS_OFFER_HREF } from "@/lib/business/offer";
import { BUSINESS_ATTRIBUTION_STORAGE_KEY, parseStoredBusinessAttribution } from "@/lib/business-trial-attribution/attribution";

const STORAGE_KEY = "audiolad.business.guest-start.v1";

/** ch, utm_* and referrer domain of this tab's first landing (BusinessAttributionCapture). */
function storedAttribution(): { attribution?: Record<string, string> } {
  try {
    const value = parseStoredBusinessAttribution(sessionStorage.getItem(BUSINESS_ATTRIBUTION_STORAGE_KEY));
    return value && Object.keys(value).length > 0 ? { attribution: value as Record<string, string> } : {};
  } catch { return {}; }
}

/** Disabled flag preserves the original anchor, including its classes and test id. */
export default function BusinessGuestStartCta({ href, className, children, testId, enabledLabel }: {
  href: string; className?: string; children: ReactNode; testId: string; enabledLabel?: string;
}) {
  const enabled = useGuestStartEnabled();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  if (!enabled) return <a href={href} className={className} data-testid={testId}>{children}</a>;

  async function start() {
    if (!accepted || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!key.current) {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        key.current = stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored) ? stored : crypto.randomUUID();
        sessionStorage.setItem(STORAGE_KEY, key.current);
      }
      const response = await fetch("/api/business/guest-start", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ accepted: true, idempotencyKey: key.current, ...storedAttribution() }),
      });
      const result = await response.json();
      if (response.ok && result.ok === true && result.redirect === "/") {
        // A finished start must not pin a later start in this tab to the old guest's key.
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
        key.current = null;
        window.location.assign(result.redirect);
        return;
      }
      setError(response.status === 429 ? copy.limit : copy.failed);
    } catch { setError(copy.failed); }
    finally { busy.current = false; setLoading(false); }
  }

  return <div data-testid={`${testId}-guest-start`}>
    <button type="button" className={className} data-testid={testId} aria-expanded={open} onClick={() => setOpen(!open)}>{enabledLabel ?? children}</button>
    {open ? <div className="space-y-3 py-3" data-testid={`${testId}-confirmation`}>
      <p>{copy.terms}</p>
      <p><a href={BUSINESS_OFFER_HREF} target="_blank" rel="noreferrer">Условия для бизнеса</a>{" · "}<a href="https://audiolad.ru/privacy" target="_blank" rel="noreferrer">Политика обработки персональных данных</a></p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={accepted} disabled={loading} onChange={(event) => setAccepted(event.target.checked)} data-testid={`${testId}-accept`} />
        <span>{copy.acceptance}</span>
      </label>
      <button type="button" className={className} disabled={!accepted || loading} aria-busy={loading} onClick={start} data-testid={`${testId}-start`}>{loading ? copy.loading : copy.start}</button>
      {error ? <p role="alert" data-testid={`${testId}-error`}>{error} <a href={href}>Зарегистрироваться</a></p> : null}
    </div> : null}
  </div>;
}
