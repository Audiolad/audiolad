"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { sendYandexGoal } from "@/lib/analytics/yandex-metrika";
import type { YandexMetrikaBusinessAtlasGoalName } from "@/lib/analytics/yandex-metrika-goals";

type CoffeeAtlasGoalLinkProps = {
  href: string;
  goal: YandexMetrikaBusinessAtlasGoalName;
  className?: string;
  children: ReactNode;
  /** External/static file links (PDF) use a plain anchor. */
  newTab?: boolean;
  download?: string;
  ariaLabel?: string;
  ariaCurrent?: "page";
  prefetch?: boolean;
};

/** Link that records an anonymous Metrika goal (consent-gated in sendYandexGoal). */
export default function CoffeeAtlasGoalLink({
  href,
  goal,
  className,
  children,
  newTab = false,
  download,
  ariaLabel,
  ariaCurrent,
  prefetch,
}: CoffeeAtlasGoalLinkProps) {
  const onClick = () => sendYandexGoal(goal);

  if (newTab || download) {
    return (
      <a
        href={href}
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
        {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
        {...(download ? { download } : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      prefetch={prefetch}
    >
      {children}
    </Link>
  );
}
