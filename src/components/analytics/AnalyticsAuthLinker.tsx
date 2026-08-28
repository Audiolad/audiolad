"use client";

import { useEffect } from "react";

import { analyticsAuthSync } from "@/lib/analytics/auth-sync";
import {
  linkAnalyticsSessionUser,
  recordPlatformSignupCompleted,
  resolveAnalyticsSessionId,
} from "@/lib/analytics/client";
import { subscribeSessionState } from "@/lib/analytics/session-state";
import { createClient } from "@/lib/supabase/client";

type PendingAuth = {
  event: "INITIAL_SESSION" | "SIGNED_IN";
  userId: string;
};

export default function AnalyticsAuthLinker() {
  useEffect(() => {
    const supabase = createClient();
    let pending: PendingAuth | null = null;

    const handlers = {
      link: () => linkAnalyticsSessionUser(),
      signup: () => recordPlatformSignupCompleted(),
    };

    const flushPending = () => {
      if (!pending) {
        return;
      }

      const analyticsSessionId = resolveAnalyticsSessionId();
      if (!analyticsSessionId) {
        return;
      }

      void analyticsAuthSync.sync(pending.event, {
        userId: pending.userId,
        analyticsSessionId,
        handlers,
      });
    };

    const remember = (event: "INITIAL_SESSION" | "SIGNED_IN", userId: string) => {
      pending = { event, userId };
      flushPending();
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user?.id) {
        pending = null;
        void analyticsAuthSync.sync("SIGNED_OUT", {
          userId: null,
          analyticsSessionId: null,
          handlers,
        });
        return;
      }

      if (event === "SIGNED_IN") {
        remember("SIGNED_IN", session.user.id);
        return;
      }

      if (event === "INITIAL_SESSION") {
        remember("INITIAL_SESSION", session.user.id);
        return;
      }

      // TOKEN_REFRESHED and other non-transition events must not link or signup.
    });

    const unsubscribeSession = subscribeSessionState(() => {
      flushPending();
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeSession();
    };
  }, []);

  return null;
}
