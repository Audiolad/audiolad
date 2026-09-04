"use client";

import { useEffect, useRef } from "react";

import {
  acquireSheetScrollLock,
  releaseSheetScrollLock,
} from "@/lib/listener/sheet-scroll-lock";

export function useSheetScrollLock(active: boolean, source?: string): void {
  const holdsLockRef = useRef(false);

  useEffect(() => {
    if (active && !holdsLockRef.current) {
      acquireSheetScrollLock(source);
      holdsLockRef.current = true;
    }

    if (!active && holdsLockRef.current) {
      releaseSheetScrollLock(source);
      holdsLockRef.current = false;
    }

    return () => {
      if (holdsLockRef.current) {
        releaseSheetScrollLock(source);
        holdsLockRef.current = false;
      }
    };
  }, [active, source]);
}
