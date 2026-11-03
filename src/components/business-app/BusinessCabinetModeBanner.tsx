"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useBusinessCabinetMode, useBusinessEntry } from "@/components/business-app/BusinessPointMode";
import { createClient } from "@/lib/supabase/client";

/**
 * Account sign-out on this browser only (the owner's phone stays signed in). Same order as the
 * site sign-out: the analytics identity link is closed first.
 */
async function signOutThisBrowser(): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("unlink_analytics_identity").then(
    () => undefined,
    () => undefined,
  );
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
}

/** «до 18:40» in the device's own clock (the owner stands next to it). */
function unlockClock(untilSeconds: number): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(untilSeconds * 1000));
}

/**
 * Mode strip under the header:
 * – preview on the owner's phone: «Так видит точка» and a green «Вернуться»;
 * – owner unlock on the hall device: until when it lasts and «Вернуть режим точки» (signs this
 *   browser out locally – the owner's phone stays signed in; the device session stays, so the hall
 *   music keeps playing: no full page load).
 * Nothing on the hall device itself or in the owner's own cabinet.
 */
export default function BusinessCabinetModeBanner() {
  const cabinet = useBusinessCabinetMode();
  const { setEntry } = useBusinessEntry();
  const router = useRouter();
  const unlockUntil = cabinet.mode === "owner" && cabinet.pointReports ? cabinet.ownerUnlockUntil : null;
  const [locking, setLocking] = useState(false);
  const staleOwnerSession = cabinet.mode === "point" && cabinet.staleOwnerSession === true;

  // No reusable owner credential stays on the hall device: an account session without a fresh
  // password (an old login, or the unlock that just ended) is signed out on this browser only.
  // Soft refresh, so the hall music keeps playing.
  useEffect(() => {
    if (!staleOwnerSession) return;
    let cancelled = false;
    void signOutThisBrowser().then(() => {
      if (!cancelled) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [staleOwnerSession, router]);

  // The unlock ends on the server by itself; then sign this browser out and re-read the page, so
  // the hall menu comes back.
  useEffect(() => {
    if (!unlockUntil) return;
    const ms = Math.max(1_000, unlockUntil * 1000 - Date.now() + 1_000);
    const timer = window.setTimeout(() => {
      void signOutThisBrowser().then(() => router.refresh());
    }, Math.min(ms, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [unlockUntil, router]);

  if (cabinet.mode === "preview") {
    // Back to the owner's own cabinet on the same screen (every venue screen is the owner's too).
    const back = () => {
      setEntry("person");
      router.refresh();
    };
    return (
      <div className="business-app-mode-banner" role="status" data-testid="biz-preview-banner">
        <p className="business-app-mode-banner__text">
          <strong>Так видит точка.</strong> Музыка на этом телефоне не попадает в отчёт заведения.
        </p>
        <button type="button" className="business-app-btn business-app-btn-cta business-app-focus-ring" data-testid="biz-preview-back" onClick={back}>
          Вернуться
        </button>
      </div>
    );
  }

  if (unlockUntil) {
    return (
      <div className="business-app-mode-banner" role="status" data-testid="biz-owner-unlock-banner">
        <p className="business-app-mode-banner__text">
          <strong>Кабинет владельца открыт до {unlockClock(unlockUntil)}.</strong> Потом устройство снова станет точкой.
        </p>
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-owner-lock"
          disabled={locking}
          onClick={async () => {
            setLocking(true);
            await signOutThisBrowser();
            router.replace("/");
            router.refresh();
          }}
        >
          Вернуть режим точки
        </button>
      </div>
    );
  }

  return null;
}
