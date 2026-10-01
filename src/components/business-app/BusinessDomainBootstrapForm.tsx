"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { bootstrapBusinessOrganizationWithLocation } from "@/app/business-app/actions";

export default function BusinessDomainBootstrapForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await bootstrapBusinessOrganizationWithLocation({
        organizationName: String(formData.get("organizationName") ?? ""),
        locationName: String(formData.get("locationName") ?? ""),
        businessCategory: String(formData.get("businessCategory") ?? ""),
        countryCode: String(formData.get("countryCode") ?? "RU"),
        timezone: String(formData.get("timezone") ?? "Europe/Moscow"),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="mt-5 space-y-3">
      <div>
        <label className="block text-sm font-medium text-[var(--biz-text)]" htmlFor="organizationName">
          Организация
        </label>
        <input
          id="organizationName"
          name="organizationName"
          required
          maxLength={120}
          className="mt-1 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
          placeholder="ООО Ромашка"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--biz-text)]" htmlFor="locationName">
          Точка
        </label>
        <input
          id="locationName"
          name="locationName"
          required
          maxLength={120}
          className="mt-1 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
          placeholder="Салон на Арбате"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--biz-text)]" htmlFor="businessCategory">
          Тип бизнеса
        </label>
        <input
          id="businessCategory"
          name="businessCategory"
          required
          maxLength={120}
          className="mt-1 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
          placeholder="Салон красоты"
          defaultValue="Салон красоты"
        />
      </div>
      <input type="hidden" name="countryCode" value="RU" />
      <input type="hidden" name="timezone" value="Europe/Moscow" />
      {error ? (
        <p className="text-sm font-medium text-[var(--biz-danger,#b42318)]" role="alert">
          Не удалось создать точку: {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--biz-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Создаём…" : "Создать организацию и точку"}
      </button>
    </form>
  );
}
