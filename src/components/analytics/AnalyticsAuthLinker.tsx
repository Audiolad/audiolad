"use client";

import { useEffect } from "react";

import {
  linkAnalyticsSessionUser,
  recordPlatformSignupCompleted,
} from "@/lib/analytics/client";
import { createClient } from "@/lib/supabase/client";

export default function AnalyticsAuthLinker() {
  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        return;
      }

      // INITIAL_SESSION covers the logged-in page load. SIGNED_IN covers
      // login / signup / auth callback. TOKEN_REFRESHED and other ticks
      // must not enter the link/signup RPCs — they were the cutover stampede.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        void linkAnalyticsSessionUser();
      }

      if (event === "SIGNED_IN") {
        void recordPlatformSignupCompleted();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
