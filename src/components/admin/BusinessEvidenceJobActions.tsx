"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { createMatchReportAction } from "@/app/(platform)/admin/business-evidence/actions";
import { MATCHER_ERROR_TEXT } from "@/lib/evidence/constants";

const PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#25135c] px-5 text-sm font-semibold text-white disabled:opacity-60";

/** Refreshes the job page every 5 s while the background check runs. */
export function JobAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export function CreateMatchReportButton({ jobId, hasReport }: { jobId: string; hasReport: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className={PRIMARY}
        disabled={pending}
        data-testid="admin-evidence-report"
        onClick={() =>
          start(async () => {
            const res = await createMatchReportAction(jobId);
            setMessage(res.ok ? (res.pdf ? "Отчёт готов." : "Отчёт готов без PDF.") : MATCHER_ERROR_TEXT[res.error] ?? "Не удалось сформировать отчёт.");
            router.refresh();
          })
        }
      >
        {pending ? "Формируем…" : hasReport ? "Сформировать отчёт заново" : "Сформировать отчёт сверки"}
      </button>
      {message ? <p className="mt-2 text-sm text-[#25135c]" role="status">{message}</p> : null}
    </div>
  );
}
