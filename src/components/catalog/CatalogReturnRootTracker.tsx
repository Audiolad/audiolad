"use client";

import { useEffect } from "react";

import { ensureHistoryTraversalTracking } from "@/lib/catalog/history-traversal";
import {
  clearCatalogReturnSnapshot,
  CATALOG_RETURN_VIEWER_KEY,
} from "@/lib/catalog/return-state";
import { createClient } from "@/lib/supabase/client";

// Install the history / click listeners at the app root, before the catalog
// grid chunk is imported: a plain click on the "Каталог" tab after F5 on any
// other page must already be seen as a fresh navigation.
if (typeof window !== "undefined") {
  ensureHistoryTraversalTracking();
}

/**
 * Erases the catalog return snapshot when the viewer changes (sign-out, or a
 * different account signs in), so one person's cards (saved hearts, grants)
 * never come back for another.
 */
export default function CatalogReturnRootTracker() {
  useEffect(() => {
    let storage: Storage | null = null;

    try {
      storage = window.sessionStorage;
    } catch {
      return;
    }

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const viewer = session?.user?.id ?? "";

      try {
        if (event === "SIGNED_OUT" || !viewer) {
          clearCatalogReturnSnapshot(storage);
          storage?.removeItem(CATALOG_RETURN_VIEWER_KEY);
          return;
        }

        if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          return;
        }

        const known = storage?.getItem(CATALOG_RETURN_VIEWER_KEY);

        if (known !== viewer) {
          clearCatalogReturnSnapshot(storage);
          storage?.setItem(CATALOG_RETURN_VIEWER_KEY, viewer);
        }
      } catch {
        // storage unavailable: nothing to protect
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
