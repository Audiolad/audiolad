import Link from "next/link";

import { businessOwnerSurnamePromptCopy } from "@/lib/business-app/profile";

/**
 * Non-blocking reminder for existing Business accounts without a surname.
 * Music and access keep working; the CTA opens the profile field that should be
 * filled first (given name if it is also empty, otherwise surname). Sergey: any
 * warning that asks to do something elsewhere must include a direct clickable link.
 */
export default function BusinessOwnerSurnamePrompt({ missingName = false }: { missingName?: boolean }) {
  const copy = businessOwnerSurnamePromptCopy(missingName);
  return (
    <section
      className="business-app-card space-y-3"
      role="status"
      data-testid="biz-owner-surname-prompt"
      data-missing-name={missingName ? "true" : "false"}
      aria-labelledby="biz-owner-surname-prompt-title"
    >
      <p id="biz-owner-surname-prompt-title" className="text-[1.05rem] leading-relaxed text-[var(--biz-text)]">
        {copy.prompt}
      </p>
      <p>
        <Link
          href={copy.href}
          className="business-app-btn business-app-btn-cta business-app-focus-ring"
          data-testid="biz-owner-surname-prompt-cta"
        >
          {copy.cta}
        </Link>
      </p>
    </section>
  );
}
