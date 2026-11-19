"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BUSINESS_INN_ERRORS } from "@/lib/business/legal/inn";

type Identity = { inn: string; kind: "ul" | "ip"; name: string; ogrn: string } | null;

/**
 * ИНН Клиента (оферта ред. 3, раздел 3). Владелец вводит только ИНН; наименование и ОГРН/ОГРНИП
 * подставляются из реестра ФНС. Soft refresh: музыка в кабинете не прерывается.
 */
export default function BusinessLegalIdentityForm({ identity, canEdit }: { identity: Identity; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(identity === null);
  const [inn, setInn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2" data-testid="biz-legal-identity">
      {identity && !editing ? (
        <div className="space-y-1 text-sm leading-6 text-[var(--biz-text)]" data-testid="biz-legal-identity-saved">
          <p className="font-semibold">{identity.name}</p>
          <p className="text-[var(--biz-text-muted)]">
            ИНН {identity.inn} · {identity.kind === "ip" ? "ОГРНИП" : "ОГРН"} {identity.ogrn} – из реестра ФНС
          </p>
          {canEdit ? (
            <button
              type="button"
              className="text-sm font-semibold text-[var(--biz-accent)] underline underline-offset-2 business-app-focus-ring"
              onClick={() => setEditing(true)}
            >
              Изменить ИНН
            </button>
          ) : null}
        </div>
      ) : canEdit ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                const response = await fetch("/api/business/legal-identity", {
                  method: "POST",
                  credentials: "same-origin",
                  cache: "no-store",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ inn }),
                });
                const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                if (!response.ok) {
                  setError(BUSINESS_INN_ERRORS[payload?.error ?? "internal_error"] ?? BUSINESS_INN_ERRORS.internal_error);
                  return;
                }
                setEditing(false);
                setInn("");
                router.refresh();
              } catch {
                setError(BUSINESS_INN_ERRORS.registry_unavailable);
              }
            });
          }}
        >
          <label className="block text-sm font-medium text-[var(--biz-text)]" htmlFor="biz-legal-inn">
            ИНН организации или ИП
            <input
              id="biz-legal-inn"
              value={inn}
              onChange={(event) => setInn(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={16}
              required
              placeholder="10 или 12 цифр"
              data-testid="biz-legal-inn"
              className="mt-1 w-full max-w-xs rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
            />
          </label>
          <p className="text-xs leading-5 text-[var(--biz-text-muted)]">
            Название и ОГРН или ОГРНИП мы возьмём из реестра ФНС по ИНН – вводить их не нужно.
          </p>
          {error ? (
            <p className="text-sm font-medium text-[var(--biz-danger)]" role="alert" data-testid="biz-legal-inn-error">{error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="business-app-btn business-app-btn-cta business-app-focus-ring" data-testid="biz-legal-inn-save">
              {pending ? "Проверяем в реестре…" : "Сохранить ИНН"}
            </button>
            {identity ? (
              <button type="button" className="business-app-btn business-app-focus-ring" onClick={() => { setEditing(false); setError(null); }}>
                Отмена
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-sm text-[var(--biz-text-muted)]">ИНН указывает владелец учётной записи.</p>
      )}
    </div>
  );
}
