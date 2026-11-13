"use client";

import Image from "next/image";
import Link from "next/link";

import { useBusinessHostname } from "@/components/business-app/BusinessDomainProvider";
import { businessCabinetHomePath } from "@/lib/business-app/host";

import {
  BUSINESS_BRAND_MARK_SRC,
  getHostBrandName,
} from "@/lib/business-app/brand-icons";

/**
 * Leather lotus in a circle, next to the host-aware brand name
 * («АудиоЛад Кофейня» on coffee.audiolad.ru, «АудиоЛад Бизнес» otherwise).
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
  const hostname = useBusinessHostname();
  const brandName = getHostBrandName(hostname);
  return (
    <Link
      href={businessCabinetHomePath(hostname)}
      className={`business-app-brand business-app-focus-ring${compact ? " is-compact" : ""}`}
      aria-label={compact ? brandName : undefined}
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
      {compact ? null : <span className="business-app-brand__name">{brandName}</span>}
    </Link>
  );
}
