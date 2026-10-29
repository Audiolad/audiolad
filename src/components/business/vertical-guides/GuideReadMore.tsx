import Link from "next/link";

import type { GuideLink } from "@/lib/business/vertical-guides/types";

/** «Читайте также»: internal links only (checked in scripts/business-coffee-guide-unit.mts). */
export default function GuideReadMore({ links }: { links: readonly GuideLink[] }) {
  return (
    <nav className="guide-wrap guide-block" aria-labelledby="guide-more-title">
      <h2 id="guide-more-title" className="guide-display guide-h2">
        Читайте также
      </h2>
      <ul className="guide-links">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} target="_blank" rel="noopener">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
