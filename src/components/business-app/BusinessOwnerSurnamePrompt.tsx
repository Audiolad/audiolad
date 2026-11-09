import Link from "next/link";

import {
  BUSINESS_OWNER_SURNAME_REQUIRED_CTA,
  BUSINESS_OWNER_SURNAME_REQUIRED_PROMPT,
  BUSINESS_PROFILE_SURNAME_HREF,
} from "@/lib/business-app/profile";

/**
 * Non-blocking reminder for existing Business accounts without a surname.
 * Music and access keep working; the CTA opens the profile surname field (Sergey: any warning
 * that asks to do something elsewhere must include a direct clickable link).
 */
export default function BusinessOwnerSurnamePrompt() {
  return (
    <section
      className="business-app-card space-y-3"
      role="status"
      data-testid="biz-owner-surname-prompt"
      aria-labelledby="biz-owner-surname-prompt-title"
    >
      <p id="biz-owner-surname-prompt-title" className="text-[1.05rem] leading-relaxed text-[var(--biz-text)]">
        {BUSINESS_OWNER_SURNAME_REQUIRED_PROMPT}
      </p>
      <p>
        <Link
          href={BUSINESS_PROFILE_SURNAME_HREF}
          className="business-app-btn business-app-btn-cta business-app-focus-ring"
          data-testid="biz-owner-surname-prompt-cta"
        >
          {BUSINESS_OWNER_SURNAME_REQUIRED_CTA}
        </Link>
      </p>
    </section>
  );
}
