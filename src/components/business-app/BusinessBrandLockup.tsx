import Image from "next/image";
import Link from "next/link";

import {
  BUSINESS_BRAND_MARK_SRC,
  BUSINESS_BRAND_NAME,
} from "@/lib/business-app/brand-icons";

/**
 * Leather lotus in a circle, next to «АудиоЛад Бизнес».
 * Desktop sidebar (compact when the menu is collapsed) and the mobile top bar.
 * Guest and member cabinets share this lockup.
 */
export default function BusinessBrandLockup({
  compact = false,
  testId = "biz-brand",
}: {
  compact?: boolean;
  testId?: string;
}) {
  return (
    <Link
      href="/"
      className={`business-app-brand business-app-focus-ring${compact ? " is-compact" : ""}`}
      aria-label={compact ? BUSINESS_BRAND_NAME : undefined}
      data-testid={testId}
    >
      <Image
        src={BUSINESS_BRAND_MARK_SRC}
        alt=""
        width={160}
        height={160}
        className="business-app-brand__mark"
        unoptimized
      />
      {compact ? null : <span className="business-app-brand__name">{BUSINESS_BRAND_NAME}</span>}
    </Link>
  );
}
