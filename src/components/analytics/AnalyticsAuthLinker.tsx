"use client";

import { useEffect } from "react";

import {
  shouldLinkAnalyticsSessionOnAuthEvent,
  shouldRecordSignupCompletedOnAuthEvent,
} from "@/lib/analytics/auth-link";
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

      // TOKEN_REFRESHED / USER_UPDATED must not hit analytics RPCs.
      // A separate session read is omitted because it doubled INITIAL_SESSION.
      if (shouldLinkAnalyticsSessionOnAuthEvent(event)) {
        void linkAnalyticsSessionUser();
      }

      if (shouldRecordSignupCompletedOnAuthEvent(event)) {
        void recordPlatformSignupCompleted();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
