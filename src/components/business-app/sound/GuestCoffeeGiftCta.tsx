"use client";

import { BUSINESS_GIFT_TITLE } from "@/lib/access-grants/copy";
import { BUSINESS_TRIAL_SIGN_UP_HREF } from "@/lib/access-grants/paths";
import { useHasLiveBusinessAccess } from "@/components/business-app/BusinessAccessLine";
import { resolveBusinessAccess } from "@/lib/business-app/access";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { GUEST_COFFEE_PRICE } from "@/lib/business-app/guest-coffee/copy";
import { BUSINESS_TRIAL_CARD } from "@/lib/business/landing";
import { BUSINESS_PLAN_PERIOD_LABEL } from "@/lib/business/plan";

/**
 * Guest coffee page only. The price and the «no card» line come from the live plan:
 * the gift is issued after email confirmation, and sign-up does not collect a card.
 * Studio generation stays outside the gift, as in the existing gift rules.
 */
export default function GuestCoffeeGiftCta() {
  const access = resolveBusinessAccess(useBusinessDomain());
  const live = useHasLiveBusinessAccess();
  if (access.level !== "guest" || live) return null;
  const card = BUSINESS_TRIAL_CARD.charAt(0).toLowerCase() + BUSINESS_TRIAL_CARD.slice(1);
  return (
    <div className="business-atmosphere-action" data-testid="biz-guest-gift">
      <a
        href={BUSINESS_TRIAL_SIGN_UP_HREF}
        className="business-app-btn business-app-btn-primary business-app-focus-ring business-atmosphere-assemble"
        data-testid="biz-guest-gift-cta"
      >
        {`Получить ${BUSINESS_GIFT_TITLE}`}
      </a>
      <p className="text-center text-sm text-[var(--biz-text-muted)]">
        {`Со всеми функциями. Далее ${GUEST_COFFEE_PRICE} ${BUSINESS_PLAN_PERIOD_LABEL} (${card})`}
      </p>
    </div>
  );
}
