"use client";

import Link from "next/link";
import { useState } from "react";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  accessLinkPublicErrorMessage,
  type PracticeAccessLinkPreview,
} from "@/lib/products/access-links";

export function AccessLinkLanding({
  token,
  returnPath,
  preview,
  isAuthenticated,
}: {
  token: string;
  returnPath: string;
  preview: PracticeAccessLinkPreview;
  isAuthenticated: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    code: string;
    message: string;
    productHref: string | null;
  } | null>(
    preview.status === "already_redeemed_by_you"
      ? {
          code: "already_redeemed_by_you",
          message: accessLinkPublicErrorMessage("already_redeemed_by_you"),
          productHref: preview.productHref,
        }
      : null,
  );
  const [error, setError] = useState<string | null>(
    preview.status === "active" || preview.status === "already_redeemed_by_you"
      ? null
      : accessLinkPublicErrorMessage(preview.status),
  );

  const showLevel =
    preview.publicationClass === "course" && preview.targetAccessLevel > 1;
  const productHref = result?.productHref ?? preview.productHref;
  const granted =
    result?.code === "granted" || result?.code === "already_redeemed_by_you";

  async function redeem() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/access/${encodeURIComponent(token)}/redeem`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        code?: string;
        error?: string;
        message?: string;
        productHref?: string | null;
      };

      if (!response.ok && payload.error !== "already_redeemed_by_you") {
        setError(payload.message ?? accessLinkPublicErrorMessage(payload.error));
        return;
      }

      setResult({
        code: payload.code ?? payload.error ?? "granted",
        message:
          payload.message ??
          accessLinkPublicErrorMessage(payload.code ?? payload.error),
        productHref: payload.productHref ?? preview.productHref,
      });
    } catch {
      setError(accessLinkPublicErrorMessage("internal_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f7f4fb] px-4 py-10">
      <div className="mx-auto w-full max-w-[560px] space-y-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9a91b8]">
          АудиоЛад
        </p>
        <h1 className="text-2xl font-semibold leading-tight text-[#2f2647]">
          Вам предоставлен доступ к: {preview.productTitle}
        </h1>

        {showLevel ? (
          <div className="rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
            <p className="text-sm font-medium text-[#3f3560]">
              {preview.levelTitle ?? `Уровень ${preview.targetAccessLevel}`}
            </p>
            {preview.levelDescription ? (
              <p className="mt-1 text-sm leading-6 text-[#5c5278]">
                {preview.levelDescription}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm leading-6 text-[#9b3d3d]">{error}</p>
        ) : null}

        {granted ? (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-[#3d8d65]">
              {result?.code === "already_redeemed_by_you"
                ? "Доступ уже открыт."
                : "Доступ открыт."}
            </p>
            {productHref ? (
              <Link
                href={productHref}
                className="inline-flex rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
              >
                Перейти к продукту
              </Link>
            ) : null}
          </div>
        ) : null}

        {!granted && preview.status === "active" && !isAuthenticated ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={buildAuthRouteHref("/auth/sign-in", returnPath)}
              className="inline-flex rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
            >
              Войти
            </Link>
            <Link
              href={buildAuthRouteHref("/auth/sign-up", returnPath)}
              className="inline-flex rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
            >
              Зарегистрироваться
            </Link>
          </div>
        ) : null}

        {!granted && preview.status === "active" && isAuthenticated ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void redeem()}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Открыть доступ
          </button>
        ) : null}
      </div>
    </main>
  );
}
