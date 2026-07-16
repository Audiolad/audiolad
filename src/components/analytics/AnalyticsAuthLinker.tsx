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

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void linkAnalyticsSessionUser();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        return;
      }

      void linkAnalyticsSessionUser();

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
