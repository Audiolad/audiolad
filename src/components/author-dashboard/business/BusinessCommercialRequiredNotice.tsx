import Link from "next/link";

import {
  BUSINESS_COMMERCIAL_REQUIRED_CTA,
  BUSINESS_COMMERCIAL_REQUIRED_NOTICE,
  buildCommercialApplicationHref,
} from "@/lib/author-dashboard/business-access";

/** Notice for authors without a commercial status (nav click and direct /author-dashboard/business). */
export default function BusinessCommercialRequiredNotice({
  authorSlug,
  id,
}: {
  authorSlug?: string | null;
  id?: string;
}) {
  return (
    <div
      id={id}
      role="status"
      data-testid="business-commercial-required"
      className="rounded-2xl border border-[#e4d7f4] bg-[#faf6ff] p-4 text-sm leading-6 text-[#4c3d78]"
    >
      <p>{BUSINESS_COMMERCIAL_REQUIRED_NOTICE}</p>
      <Link
        href={buildCommercialApplicationHref(authorSlug)}
        data-testid="business-commercial-required-cta"
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white"
      >
        {BUSINESS_COMMERCIAL_REQUIRED_CTA}
      </Link>
    </div>
  );
}
