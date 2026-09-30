"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  createLivePublicContentController,
  probePublicCatalogHead,
  realtimeReconnectDelayMs,
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
   * Light visible-tab check. Defaults to the public catalog head, which
   * also claims due scheduled publications.
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

    const controller = createLivePublicContentController({
      refresh: () => refreshRef.current(),
      probe: () => (probeRef.current ?? probePublicCatalogHead)(),
      getVisibility: () =>
        document.visibilityState === "hidden" ? "hidden" : "visible",
      subscribeVisibility: (listener) => {
        const onChange = () => listener();
        document.addEventListener("visibilitychange", onChange);
        return () => document.removeEventListener("visibilitychange", onChange);
      },
    });
    const stopController = controller.start();

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
        .channel(`live-public-practices-${currentGeneration}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "practices" },
          (payload) => {
            const signal = signalFromRealtimePayload(payload);
            controller.signal(signal.source);
          },
        )
        .subscribe((status) => {
          if (stopped || currentGeneration !== generation) {
            return;
          }

          if (status === "SUBSCRIBED") {
            attempt = 0;
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
