"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BUSINESS_OFFER_EDITION, BUSINESS_OFFER_HREF } from "@/lib/business/offer";

/**
 * Новая редакция договора-оферты: принять один раз для всей учётной записи (t1591u).
 * Не блокирует музыку и доступ. Прямая ссылка на текст – рядом с кнопкой.
 */
export default function BusinessOfferReacceptPrompt({ newEdition }: { newEdition: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  if (done) return null;
  return (
    <section className="business-app-card space-y-3" role="status" data-testid="biz-offer-reaccept">
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">
        {newEdition ? "Новая редакция договора" : "Примите договор-оферту"}
      </h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        {newEdition
          ? "Мы обновили договор-оферту «АудиоЛад Кофейня»: защита заведения, сертификат заведения с проверкой по QR-коду, ИНН и адрес заведения. Примите новую редакцию один раз – для всей учётной записи и всех заведений. Музыка в заведениях играет как раньше."
          : "Договор-оферта «АудиоЛад Кофейня» принимается один раз – для всей учётной записи и всех заведений. Без него не выдаётся сертификат заведения."}
      </p>
      <p className="text-sm leading-6">
        <Link href={BUSINESS_OFFER_HREF} className="font-semibold text-[var(--biz-accent)] underline underline-offset-2" data-testid="biz-offer-reaccept-link">
          Прочитать договор-оферту, {BUSINESS_OFFER_EDITION.label.toLowerCase()}
        </Link>
      </p>
      {error ? <p className="text-sm font-medium text-[var(--biz-danger)]" role="alert">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        className="business-app-btn business-app-btn-cta business-app-focus-ring"
        data-testid="biz-offer-reaccept-accept"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const response = await fetch("/api/business/subscription/accept", {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offerVersion: BUSINESS_OFFER_EDITION.version, offerHash: BUSINESS_OFFER_EDITION.contentHash }),
              });
              if (!response.ok) {
                setError("Не получилось принять условия. Обновите страницу и попробуйте ещё раз.");
                return;
              }
              setDone(true);
              router.refresh();
            } catch {
              setError("Нет связи с сервером. Попробуйте ещё раз.");
            }
          });
        }}
      >
        {pending ? "Сохраняем…" : newEdition ? "Принять новую редакцию" : "Принять договор"}
      </button>
      <p className="text-xs leading-5 text-[var(--biz-text-muted)]">
        Нажимая кнопку, вы принимаете договор-оферту «АудиоЛад Кофейня», {BUSINESS_OFFER_EDITION.label.toLowerCase()}, с приложениями 1–4.
      </p>
    </section>
  );
}
