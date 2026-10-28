import Link from "next/link";

import { formatMoscowDateTime } from "@/lib/access-grants/policy";
import type { PublicPerformanceLicence } from "@/lib/access-grants/public-performance-licence";
import {
  BUSINESS_LICENCE_ADMITTED_RULE,
  BUSINESS_LICENCE_PLACE_RULE,
  BUSINESS_LICENCE_SECTOR_RULE,
  BUSINESS_LICENCE_TRIAL_RULE,
  BUSINESS_VENUE_ADDRESS_LINK,
  BUSINESS_VENUE_ADDRESS_PROMPT,
  businessLicenceCardLine,
  businessLicenceStatusLabel,
} from "@/lib/business-app/licensing-copy";
import { venuePlaceLine } from "@/lib/business-app/venue-place";

function moscowLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return formatMoscowDateTime(date);
}

/** Documents section: the existing terms, the access status, and this point's address. */
export default function BusinessVenueLicenceSection({
  licence,
  venueName,
  addressLine1,
  canEdit,
}: {
  licence: PublicPerformanceLicence | null;
  venueName: string | null;
  addressLine1: string | null;
  canEdit: boolean;
}) {
  const place = venuePlaceLine(venueName, addressLine1);
  const start = moscowLabel(licence?.startsAt ?? null);
  const end = moscowLabel(licence?.endsAt ?? null);
  const addressHref = venueName ? "/preferences#venue" : "/onboarding";
  return (
    <section id="licence" className="business-app-card" data-testid="venue-licence-section" aria-labelledby="venue-licence-title">
      <h2 id="venue-licence-title" className="text-[1.2rem] font-bold text-[var(--biz-text)]">
        Лицензия точки
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--biz-text)]" data-testid="venue-licence-rule">
        {BUSINESS_LICENCE_TRIAL_RULE}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">{BUSINESS_LICENCE_PLACE_RULE}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">{BUSINESS_LICENCE_ADMITTED_RULE}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">{BUSINESS_LICENCE_SECTOR_RULE}</p>
      {licence ? (
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]" data-testid="venue-licence-status">
          {businessLicenceStatusLabel(licence.status)}. {businessLicenceCardLine(licence.status)}
          {start && end ? ` С ${start} по ${end}` : end ? ` До ${end}` : start ? ` С ${start}` : ""}
          {licence.sectorLabel ? ` Тип точки: ${licence.sectorLabel}.` : ""}
        </p>
      ) : null}
      {place ? (
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]" data-testid="venue-licence-place">{place}</p>
      ) : canEdit || !venueName ? (
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="venue-licence-place-missing">
          {BUSINESS_VENUE_ADDRESS_PROMPT}{" "}
          <Link href={addressHref}>{BUSINESS_VENUE_ADDRESS_LINK}</Link>
        </p>
      ) : null}
    </section>
  );
}
