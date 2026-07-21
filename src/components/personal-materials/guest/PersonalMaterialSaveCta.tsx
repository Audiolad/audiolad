"use client";

import { useCallback, useState } from "react";

import { buildAuthRouteHref } from "@/lib/auth/routes";

type PersonalMaterialSaveCtaProps = {
  isAuthenticated: boolean;
  claimApiPath: string;
  claimContextApiPath: string;
  claimCompletePath: string;
  materialId: string;
};

type SaveState = "idle" | "loading" | "success" | "error";

export default function PersonalMaterialSaveCta({
  isAuthenticated,
  claimApiPath,
  claimContextApiPath,
  claimCompletePath,
  materialId,
}: PersonalMaterialSaveCtaProps) {
  const [state, setState] = useState<SaveState>("idle");
  const [savedMaterialId, setSavedMaterialId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAuthenticatedClaim = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    const response = await fetch(claimApiPath, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      setState("error");
      setErrorMessage("Материал больше недоступен для сохранения.");
      return;
    }

    if (!response.ok) {
      setState("error");
      setErrorMessage("Не удалось сохранить диагностику. Попробуйте ещё раз.");
      return;
    }

    const payload = (await response.json()) as { materialId?: string };
    setSavedMaterialId(payload.materialId ?? materialId);
    setState("success");
  }, [claimApiPath, materialId]);

  const handleUnauthenticatedClaim = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    const response = await fetch(claimContextApiPath, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      setState("error");
      setErrorMessage("Не удалось подготовить сохранение. Попробуйте ещё раз.");
      return;
    }

    const signUpHref = buildAuthRouteHref("/auth/sign-up", claimCompletePath);
    window.location.assign(signUpHref);
  }, [claimCompletePath, claimContextApiPath]);

  const handleClick = useCallback(() => {
    if (state === "success") {
      return;
    }

    if (isAuthenticated) {
      void handleAuthenticatedClaim();
      return;
    }

    void handleUnauthenticatedClaim();
  }, [handleAuthenticatedClaim, handleUnauthenticatedClaim, isAuthenticated, state]);

  if (state === "success") {
    const targetId = savedMaterialId ?? materialId;

    return (
      <section className="space-y-3 rounded-2xl bg-[#eef8f1] p-5">
        <p className="text-base font-semibold text-[#2f6b4a]">Диагностика сохранена</p>
        <a
          href={`/my-materials/${encodeURIComponent(targetId)}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Открыть в личном кабинете
        </a>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {state === "loading" ? "Сохраняем…" : "Сохранить диагностику в АудиоЛад"}
      </button>
      <p className="text-sm leading-6 text-[#6d628f]">
        После сохранения материал будет доступен в вашем личном кабинете, даже если
        персональная ссылка будет отключена.
      </p>
      {errorMessage && (
        <p role="alert" className="text-sm text-[#b04444]">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
