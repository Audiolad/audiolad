"use client";

import { useLayoutEffect } from "react";

import {
  registerGuestPlayerFallbackTarget,
  type GuestPlayerFallbackTarget,
} from "@/lib/listen/guest-player-fallback";

type GuestHomePlayerSeedProps = {
  target: GuestPlayerFallbackTarget | null;
};

export default function GuestHomePlayerSeed({
  target,
}: GuestHomePlayerSeedProps) {
  useLayoutEffect(() => {
    registerGuestPlayerFallbackTarget(target);

    return () => {
      registerGuestPlayerFallbackTarget(null);
    };
  }, [target]);

  return null;
}
