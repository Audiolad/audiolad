"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import LivePublicContentSync from "@/components/public-content/LivePublicContentSync";
import { restoreWindowScrollY } from "@/lib/public-content/live-sync";

/**
 * Soft-refreshes the current route from its existing server loaders.
 * Used by surfaces that render public data from props rather than a
 * paginated client list. The visible-tab fallback compares the public
 * revision inside LivePublicContentSync and does not refresh the route on
 * every tick.
 */
export default function LivePublicRouteSync() {
  const router = useRouter();
  const refresh = useCallback(() => {
    const scrollY = typeof window === "undefined" ? null : window.scrollY;
    router.refresh();

    if (scrollY == null) {
      return;
    }

    const restore = () => restoreWindowScrollY(scrollY);
    requestAnimationFrame(restore);
    window.setTimeout(restore, 50);
  }, [router]);

  return <LivePublicContentSync refresh={refresh} />;
}
