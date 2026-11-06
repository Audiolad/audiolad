"use client";

import { useState, useTransition } from "react";

import { saveBusinessLocationVenue } from "@/app/business-app/actions";
import { BUSINESS_LICENCE_PLACE_RULE } from "@/lib/business-app/licensing-copy";

/** Owner edit of the point name and the address the licence applies to. */
export default function BusinessVenuePlaceForm({
  locationId,
  name,
  addressLine1,
  canEdit,
}: {
  locationId: string;
  name: string;
  addressLine1: string | null;
  canEdit: boolean;
}) {
  const [venueName, setVenueName] = useState(name);
  const [address, setAddress] = useState(addressLine1 ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section className="business-app-card space-y-3" id="venue" data-testid="biz-venue-place">
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Точка</h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">{BUSINESS_LICENCE_PLACE_RULE}</p>
      {canEdit ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setSaved(false);
            startTransition(async () => {
              const result = await saveBusinessLocationVenue({
                locationId,
                name: venueName,
                addressLine1: address,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSaved(true);
            });
          }}
        >
          <label className="block text-sm font-medium text-[var(--biz-text)]" htmlFor="venue-name">
            Название точки
            <input
              id="venue-name"
              value={venueName}
              onChange={(event) => setVenueName(event.target.value)}
              maxLength={120}
              required
              className="mt-1 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
            />
          </label>
          <label className="block text-sm font-medium text-[var(--biz-text)]" htmlFor="venue-address">
            Адрес точки
            <input
              id="venue-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={200}
              required
              autoComplete="street-address"
              data-testid="venue-address"
              className="mt-1 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-[var(--biz-text)]"
            />
          </label>
          {error ? (
            <p className="text-sm font-medium text-[var(--biz-danger)]" role="alert">{error}</p>
          ) : null}
          {saved ? <p className="text-sm text-[var(--biz-text-muted)]">Адрес сохранён.</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="business-app-btn business-app-btn-primary business-app-focus-ring"
            data-testid="venue-save"
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
      ) : (
        <p className="text-sm leading-6 text-[var(--biz-text)]" data-testid="venue-place-readonly">
          {addressLine1 ? `${name} – ${addressLine1}` : "Адрес точки ещё не указан."}
        </p>
      )}
    </section>
  );
}
