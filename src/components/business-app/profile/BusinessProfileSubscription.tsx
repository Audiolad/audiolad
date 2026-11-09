"use client";

import { useEffect, useState } from "react";
import { BusinessPayControls, useBusinessHomePay } from "@/components/business-app/BusinessHomeAccessCard";
import BusinessPartnerCodePanel from "@/components/business-app/BusinessPartnerCodePanel";
import { businessProfileSubscription } from "@/lib/business-app/profile-subscription";

export default function BusinessProfileSubscription({ timezone, nowIso, offerAccepted }: { timezone: string; nowIso: string; offerAccepted: boolean }) {
  const { access, canPay, accepted, busy, error, accept, pay, askReceiptEmail, receiptEmail, setReceiptEmail } = useBusinessHomePay();
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const summary = businessProfileSubscription(access, timezone, now);
  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="business-profile-subscription">
      <h2 id="business-profile-subscription" className="text-lg font-bold">Подписка</h2>
      <p className="text-xl font-bold" data-testid="biz-profile-subscription-status">{summary.title}</p>
      {summary.until ? <p className="text-sm text-[var(--biz-text-muted)]">{summary.until}</p> : null}
      <BusinessPayControls canPay={canPay} accepted={offerAccepted || accepted} busy={busy} error={error}
        onAccept={accept} onPay={pay} payLabel={summary.button} buttonVariant="cta" showAcceptedNote
        receiptEmail={askReceiptEmail ? { value: receiptEmail, onChange: setReceiptEmail } : null} />
      <BusinessPartnerCodePanel canPay={canPay} />
    </section>
  );
}
