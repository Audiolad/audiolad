"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type MouseEvent } from "react";

import {
  CATALOG_BACK_STATE_KEY,
  claimCatalogExit,
  shouldUseHistoryBackToCatalog,
} from "@/lib/catalog/return-state";

/**
 * "← Назад в каталог". When THIS history entry was opened by clicking a card
 * in the catalog (tagged in history.state on mount) the previous entry is the
 * catalog, so it behaves exactly like browser Back (same filters, same place,
 * same loaded pages). Otherwise (direct visit, search engine, Home -> product,
 * catalog -> product -> Home -> same product) it is a normal link to /catalog.
 */
export default function PracticeBackToCatalogLink({
  className,
}: {
  className: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let storage: Storage | null = null;

    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }

    if (!claimCatalogExit({ storage, pathname, now: Date.now() })) {
      return;
    }

    try {
      window.history.replaceState(
        { ...(window.history.state ?? {}), [CATALOG_BACK_STATE_KEY]: true },
        "",
      );
    } catch {
      // no tag: the link simply stays a normal link
    }
  }, [pathname]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (shouldUseHistoryBackToCatalog({ historyState: window.history.state })) {
      event.preventDefault();
      router.back();
    }
  }

  return (
    <Link href="/catalog" onClick={handleClick} className={className}>
      ← Назад в каталог
    </Link>
  );
}
