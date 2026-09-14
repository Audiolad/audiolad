"use client";

import BottomNav from "@/components/BottomNav";
import {
  applyRecoveryContinueOutcome,
} from "@/lib/auth/recovery-continue";
import { getRecoveryLandingState } from "@/lib/auth/recovery-landing";
import {
  PASSWORD_RESET_EXPIRED_MESSAGE,
  PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
  PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
} from "@/lib/auth/recovery-messages";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  stageRecoveryTokenAction,
  verifyRecoveryTokenAction,
} from "./actions";

const continueMessages = {
  temporary: PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
  expired: PASSWORD_RESET_EXPIRED_MESSAGE,
  transport: PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
};

export default function RecoveryLanding({
  initialHasStagedRecovery,
}: Readonly<{ initialHasStagedRecovery: boolean }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stagedSuccessfullyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const tokenHash = hash.get("token_hash");
      const type = hash.get("type");

      // Remove the bearer from browser history before any network request.
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      const landingState = getRecoveryLandingState({
        tokenHash,
        type,
        hasStagedRecovery: initialHasStagedRecovery,
        stagedSuccessfullyInMount: stagedSuccessfullyRef.current,
      });
      if (landingState === "ready") {
        if (active) {
          setError("");
          setReady(true);
        }
        return;
      }
      if (landingState === "expired") {
        if (active) {
          setReady(false);
          setError(PASSWORD_RESET_EXPIRED_MESSAGE);
        }
        return;
      }

      const result = await stageRecoveryTokenAction({
        tokenHash: tokenHash!,
        next: searchParams.get("next"),
      });
      if (!active) return;
      if (!result.ok) {
        setReady(false);
        setError(result.message);
        return;
      }
      stagedSuccessfullyRef.current = true;
      setError("");
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [initialHasStagedRecovery, searchParams]);

  async function continueRecovery() {
    setIsVerifying(true);
    setError("");
    try {
      const result = await verifyRecoveryTokenAction();
      const outcome =
        !result.ok || !result.destination
          ? {
              kind: "action_error" as const,
              message: result.ok
                ? PASSWORD_RESET_EXPIRED_MESSAGE
                : result.message,
              retryable:
                !result.ok &&
                result.message === PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
            }
          : {
              kind: "success" as const,
              destination: result.destination,
            };
      const ui = applyRecoveryContinueOutcome(outcome, continueMessages);
      setReady(ui.ready);
      setError(ui.error);
      if (ui.shouldNavigateTo) {
        router.replace(ui.shouldNavigateTo);
        router.refresh();
      }
    } catch {
      const ui = applyRecoveryContinueOutcome(
        { kind: "transport_error" },
        continueMessages,
      );
      setReady(ui.ready);
      setError(ui.error);
    } finally {
      setIsVerifying(false);
    }
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
        {error ? (
          <div className="mt-6 space-y-3 text-center text-sm text-[#7d70a2]">
            {ready ? (
              <button
                type="button"
                disabled={isVerifying}
                onClick={continueRecovery}
                className="font-semibold text-[#7042c5]"
              >
                Попробовать ещё раз
              </button>
            ) : null}
            <p>
              <Link href="/auth/forgot-password" className="font-semibold text-[#7042c5]">
                Запросить новую ссылку
              </Link>
            </p>
          </div>
        ) : null}
        <BottomNav />
      </div>
    </main>
  );
}
