"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  LEGAL_LINKS,
  legalLinkActiveClassName,
  legalLinkClassName,
} from "@/lib/legal/links";

type LegalLinksNavProps = {
  className?: string;
  listClassName?: string;
};

export default function LegalLinksNav({
  className,
  listClassName = "flex flex-col gap-1 text-[15px] sm:grid sm:grid-cols-2 sm:gap-2.5 lg:flex lg:flex-row lg:flex-wrap lg:gap-x-6 lg:gap-y-2.5",
}: LegalLinksNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Юридические документы" className={className}>
      <ul className={listClassName}>
        {LEGAL_LINKS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <li key={item.href}>
              {isActive ? (
                <span aria-current="page" className={legalLinkActiveClassName}>
                  {item.title}
                </span>
              ) : (
                <Link href={item.href} className={legalLinkClassName}>
                  {item.title}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
