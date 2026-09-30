"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  PUBLIC_CONTENT_REVISION_SCOPE,
  PUBLIC_CONTENT_REVISION_TABLE,
  clientVisibleRevisionRow,
  createLivePublicContentController,
  nextRevisionAction,
  parsePublicContentRevision,
  probePublicContentRevision,
  realtimeReconnectDelayMs,
  revisionRowFromRealtimePayload,
  shouldResubscribeRealtime,
  signalFromRealtimePayload,
} from "@/lib/public-content/live-sync";

type LivePublicContentSyncProps = {
  /**
   * Reload this surface from existing public loaders or APIs.
   * The Realtime payload is not passed in.
   */
  refresh: () => Promise<void> | void;
  /**
   * Light visible-tab check. Defaults to the revision endpoint, which
   * claims due scheduled publications and returns only `{ revision }`.
   */
  probe?: () => Promise<string | null>;
  enabled?: boolean;
};

export default function LivePublicContentSync({
  refresh,
  probe,
  enabled = true,
}: LivePublicContentSyncProps) {
  const refreshRef = useRef(refresh);
  const probeRef = useRef(probe);

  useEffect(() => {
    refreshRef.current = refresh;
    probeRef.current = probe;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const supabase = createClient();
    let stopped = false;
    let generation = 0;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let lastSeenRevision: number | null = null;

    const rememberRevision = (current: number | null) => {
      const action = nextRevisionAction(lastSeenRevision, current);
      lastSeenRevision = action.lastSeen;
      return action.refresh;
    };

    const readCurrentRevision = async () => {
      try {
        const { data, error } = await supabase
          .from(PUBLIC_CONTENT_REVISION_TABLE)
          .select("revision")
          .eq("scope", PUBLIC_CONTENT_REVISION_SCOPE)
          .maybeSingle();

        if (error) {
          return null;
        }

        return parsePublicContentRevision(data?.revision);
      } catch {
        return null;
      }
    };

    const controller = createLivePublicContentController({
      refresh: () => refreshRef.current(),
      probe: async () => {
        const token = await (probeRef.current ?? probePublicContentRevision)();
        rememberRevision(parsePublicContentRevision(token));
        return token;
      },
      getVisibility: () =>
        document.visibilityState === "hidden" ? "hidden" : "visible",
      subscribeVisibility: (listener) => {
        const onChange = () => listener();
        document.addEventListener("visibilitychange", onChange);
        return () => document.removeEventListener("visibilitychange", onChange);
      },
    });
    const stopController = controller.start();

    const catchUpRevision = async () => {
      if (stopped) {
        return;
      }

      const current = await readCurrentRevision();

      if (stopped) {
        return;
      }

      if (rememberRevision(current)) {
        controller.signal("realtime");
      }
    };

    void catchUpRevision();

    const closeChannel = () => {
      if (!channel) {
        return;
      }

      const current = channel;
      channel = null;
      void supabase.removeChannel(current);
    };

    const subscribe = () => {
      if (stopped) {
        return;
      }

      const currentGeneration = ++generation;
      closeChannel();
      channel = supabase
        .channel(
          `live-public-content-revision-${currentGeneration}-${Math.random().toString(36).slice(2)}`,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: PUBLIC_CONTENT_REVISION_TABLE,
            filter: `scope=eq.${PUBLIC_CONTENT_REVISION_SCOPE}`,
          },
          (payload) => {
            const visible = clientVisibleRevisionRow(revisionRowFromRealtimePayload(payload));
            rememberRevision(parsePublicContentRevision(visible?.revision));
            const signal = signalFromRealtimePayload(visible);
            controller.signal(signal.source);
          },
        )
        .subscribe((status) => {
          if (stopped || currentGeneration !== generation) {
            return;
          }

          if (status === "SUBSCRIBED") {
            attempt = 0;
            void catchUpRevision();
            return;
          }

          if (!shouldResubscribeRealtime(status, stopped)) {
            return;
          }

          if (reconnectTimer) {
            return;
          }

          const delay = realtimeReconnectDelayMs(attempt);
          attempt += 1;
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;

            if (!stopped) {
              subscribe();
            }
          }, delay);
        });
    };

    subscribe();

    return () => {
      stopped = true;
      generation += 1;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      stopController();
      closeChannel();
    };
  }, [enabled]);

  return null;
}
