"use client";

import { useEffect } from "react";

export default function PersonalMaterialGuestError({
  reset,
}: {
  reset: () => void;
}) {
  useEffect(() => {
    // Neutral client-side error boundary — no token or API details.
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f4fb] px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-[#2f2647]">Не удалось открыть материал</h1>
        <p className="mt-3 text-sm leading-6 text-[#6d628f]">
          Попробуйте обновить страницу. Если проблема повторится, обратитесь к автору.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Повторить
        </button>
      </div>
    </div>
  );
}
