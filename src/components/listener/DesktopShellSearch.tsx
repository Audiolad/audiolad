"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import PlatformCatalogInlineSearch from "@/components/listener/PlatformCatalogInlineSearch";
import PlatformSearchCombobox, {
  PlatformSearchSkeleton,
} from "@/components/listener/PlatformSearchCombobox";
import { isPublicPlaylistCatalogPath } from "@/lib/auth/routes";
import {
  getListenerDesktopViewportServerSnapshot,
  getListenerDesktopViewportSnapshot,
  subscribeListenerDesktopViewport,
} from "@/lib/listener/desktop-viewport";

function useClientMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function useListenerDesktopViewport(): boolean {
  return useSyncExternalStore(
    subscribeListenerDesktopViewport,
    getListenerDesktopViewportSnapshot,
    getListenerDesktopViewportServerSnapshot,
  );
}

type DesktopShellSearchProps = {
  catalogFilters?: ReactNode;
};

function CatalogDesktopSearchRow({
  catalogFilters,
  search,
}: {
  catalogFilters?: ReactNode;
  search: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-h-[52px] min-w-0 flex-1">{search}</div>
      <div className="shrink-0">{catalogFilters}</div>
    </div>
  );
}

/**
 * Desktop-only shell search. Hidden below xl so mobile pages keep zero
 * extra search forms in the DOM.
 *
 * On /catalog this is the compact chrome row: PlatformCatalogInlineSearch
 * plus CatalogMobileFiltersSlot (passed in from the server shell).
 * On /playlists/catalog the page owns PlaylistCatalogSearch, so this
 * shell slot stays empty. Other routes keep PlatformSearchCombobox.
 */
export default function DesktopShellSearch({
  catalogFilters,
}: DesktopShellSearchProps) {
  const pathname = usePathname();
  const mounted = useClientMounted();
  const isDesktop = useListenerDesktopViewport();
  const isCatalogRoute =
    pathname === "/catalog" || pathname.startsWith("/catalog");

  if (isPublicPlaylistCatalogPath(pathname)) {
    return null;
  }

  if (!mounted) {
    if (isCatalogRoute) {
      return (
        <CatalogDesktopSearchRow
          catalogFilters={catalogFilters}
          search={<PlatformSearchSkeleton density="compact" />}
        />
      );
    }

    return <PlatformSearchSkeleton />;
  }

  if (!isDesktop) {
    return null;
  }

  if (isCatalogRoute) {
    return (
      <CatalogDesktopSearchRow
        catalogFilters={catalogFilters}
        search={
          <Suspense fallback={<PlatformSearchSkeleton density="compact" />}>
            <PlatformCatalogInlineSearch density="compact" />
          </Suspense>
        }
      />
    );
  }

  return <PlatformSearchCombobox />;
}
