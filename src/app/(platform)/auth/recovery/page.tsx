"use client";

import BottomNav from "@/components/BottomNav";
import { PASSWORD_RESET_EXPIRED_MESSAGE } from "@/lib/auth/recovery-messages";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  stageRecoveryTokenAction,
  verifyRecoveryTokenAction,
} from "./actions";

function RecoveryLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = hash.get("token_hash");
    const type = hash.get("type");

    // Remove the bearer from browser history before any network request.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    if (!tokenHash || type !== "recovery") {
      setError(PASSWORD_RESET_EXPIRED_MESSAGE);
      return;
    }

    void stageRecoveryTokenAction({
      tokenHash,
      next: searchParams.get("next"),
    }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [searchParams]);

  async function continueRecovery() {
    setIsVerifying(true);
    setError("");
    const result = await verifyRecoveryTokenAction();
    if (!result.ok || !result.destination) {
      setError(result.ok ? PASSWORD_RESET_EXPIRED_MESSAGE : result.message);
      setIsVerifying(false);
      return;
    }
    router.replace(result.destination);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pt-8 ${platformNavPaddingClass}`}>
        <header className="text-center">
          <Link href="/" className="text-[30px] font-semibold text-[#7042c5]">АудиоЛад</Link>
          <h1 className="mt-8 text-[30px] font-semibold">Восстановление пароля</h1>
          <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
            Нажмите продолжить, чтобы перейти к созданию нового пароля.
          </p>
        </header>
        {error ? (
          <div role="alert" className="mt-8 rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-4 text-sm leading-6 text-[#b34f63]">
            {error}
          </div>
        ) : (
          <button type="button" disabled={!ready || isVerifying} aria-busy={isVerifying} onClick={continueRecovery} className="primary-cta primary-cta--form mt-8">
            {isVerifying ? "Проверяем…" : "Продолжить"}
          </button>
        )}
        {error ? <p className="mt-6 text-center text-sm text-[#7d70a2]"><Link href="/auth/forgot-password" className="font-semibold text-[#7042c5]">Запросить новую ссылку</Link></p> : null}
        <BottomNav />
      </div>
    </main>
  );
}

export default function RecoveryPage() {
  return <Suspense><RecoveryLanding /></Suspense>;
}
