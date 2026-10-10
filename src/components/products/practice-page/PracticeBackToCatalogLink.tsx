"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { shouldUseHistoryBackToCatalog } from "@/lib/catalog/return-state";

/**
 * "← Назад в каталог". When the visitor came from the catalog in this tab it
 * behaves exactly like the browser Back button (same filters, same place,
 * same loaded pages). Otherwise (direct visit, search engine) it is a normal
 * link to the catalog.
 */
export default function PracticeBackToCatalogLink({
  className,
}: {
  className: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

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

    let storage: Storage | null = null;

    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }

    if (
      shouldUseHistoryBackToCatalog({ storage, pathname, now: Date.now() })
    ) {
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
