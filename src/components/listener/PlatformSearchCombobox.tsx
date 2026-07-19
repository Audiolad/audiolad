"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";

import PlatformCatalogInlineSearch from "@/components/listener/PlatformCatalogInlineSearch";
import PlatformSearchSuggestCombobox from "@/components/listener/PlatformSearchSuggestCombobox";
import { PlatformSearchSkeleton } from "@/components/listener/PlatformSearchField";
import { resolvePlatformSearchMode } from "@/lib/catalog/platform-search";

export { PlatformSearchSkeleton };

export default function PlatformSearchCombobox() {
  const pathname = usePathname();
  const mode = resolvePlatformSearchMode(pathname);

  if (mode === "catalog-inline") {
    return (
      <Suspense fallback={<PlatformSearchSkeleton />}>
        <PlatformCatalogInlineSearch />
      </Suspense>
    );
  }

  return <PlatformSearchSuggestCombobox />;
}
