import Link from "next/link";
import { redirect } from "next/navigation";

import { activateBusinessTrial } from "@/lib/access-grants/apply";
import {
  BUSINESS_GIFT_CLOSING_NOTE,
  BUSINESS_GIFT_LICENSE_NOTE,
  BUSINESS_GIFT_TITLE,
  BUSINESS_REGISTERED_NOTE,
  BUSINESS_STORE_UNAVAILABLE_NOTE,
  BUSINESS_UNCONFIRMED_NOTE,
  businessGiftPriceNote,
} from "@/lib/access-grants/copy";
import { businessOnboardingEntryHref, businessWorkspaceHref, BUSINESS_TRIAL_SIGN_IN_HREF, BUSINESS_TRIAL_RETURN_PATH } from "@/lib/access-grants/paths";
import { isEmailConfirmed } from "@/lib/access-grants/policy";
import { createSupabaseAccessGrantStore } from "@/lib/access-grants/supabase-store";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { emailNotReceivedArticle } from "@/lib/help/articles/troubleshooting/email-not-received";
import { helpArticlePath } from "@/lib/help/paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HELP_HREF = helpArticlePath(emailNotReceivedArticle);

/**
 * Lands here after the existing email registration or sign-in (next=/auth/business-return).
 * Confirmed addresses continue into the business workspace. The gift is issued once.
 */
export default async function BusinessTrialReturnPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(BUSINESS_TRIAL_SIGN_IN_HREF);
  }

  if (!isEmailConfirmed(user) || !user.email) {
    return <BusinessTrialReturnPending />;
  }

  try {
    await activateBusinessTrial(createSupabaseAccessGrantStore(), {
      userId: user.id,
      email: user.email,
    });
  } catch {
    return (
      <main className="mx-auto min-h-screen max-w-[430px] bg-platform-surface px-5 py-10 text-[#25135c]">
        <h1 className="text-[28px] font-semibold">{BUSINESS_GIFT_TITLE}</h1>
        <p className="mt-4 text-sm leading-6 text-[#7d70a2]">{BUSINESS_STORE_UNAVAILABLE_NOTE}</p>
        <p className="mt-6">
          <a className="font-semibold text-[#7042c5] underline" href={BUSINESS_TRIAL_RETURN_PATH}>
            Перейти и повторить
          </a>
        </p>
      </main>
    );
  }

  let needsVenue = false;
  try {
    const domain = await loadBusinessOwnerHomeContext();
    needsVenue = domain.status === "authenticated" && !domain.organizationId;
  } catch {
    needsVenue = false;
  }

  if (needsVenue) {
    redirect(businessOnboardingEntryHref("cafe"));
  }

  redirect(businessWorkspaceHref("cafe"));
}

/** Unconfirmed address: the same short gift lines as the cabinet home card. The period has not started. */
export function BusinessTrialReturnPending() {
  return (
    <main className="mx-auto min-h-screen max-w-[430px] bg-platform-surface px-5 py-10 text-[#25135c]" data-testid="biz-return-access">
      <h1 className="text-[28px] font-semibold">{BUSINESS_GIFT_TITLE}</h1>
      <p className="mt-4 text-sm leading-6 text-[#7d70a2]">{BUSINESS_UNCONFIRMED_NOTE}</p>
      <p className="mt-3 text-sm leading-6">{BUSINESS_REGISTERED_NOTE}</p>
      <p className="mt-3 text-sm leading-6 text-[#7d70a2]" data-testid="biz-return-closing">{BUSINESS_GIFT_CLOSING_NOTE}</p>
      <p className="mt-3 text-sm leading-6 text-[#7d70a2]" data-testid="biz-return-license">{BUSINESS_GIFT_LICENSE_NOTE}</p>
      <p className="mt-3 text-sm leading-6 text-[#7d70a2]" data-testid="biz-return-price">{businessGiftPriceNote()}</p>
      <p className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link className="font-semibold text-[#7042c5] underline" href={BUSINESS_TRIAL_SIGN_IN_HREF}>
          Перейти и войти после подтверждения
        </Link>
        <Link className="font-semibold text-[#7042c5] underline" href={HELP_HREF}>
          Перейти и найти письмо
        </Link>
      </p>
    </main>
  );
}
