"use client";

import { useState } from "react";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { useBusinessEntry, usePointMode } from "@/components/business-app/BusinessPointMode";

/** Two segments: the person's name, and the venue name. Guests do not see it. */
export default function BusinessEntrySwitcher() {
  const domain = useBusinessDomain();
  const point = usePointMode();
  const { entry, setEntry } = useBusinessEntry();
  const [hint, setHint] = useState<string | null>(null);
  if (domain.status !== "authenticated" || !domain.location) return null;

  const person = domain.owner.firstName.trim();
  const venue = domain.location.name.trim() || "Точка";
  const personOn = !point && entry === "person";
  const venueOn = point || entry === "venue";

  return (
    <div className="business-entry-switcher" data-testid="biz-entry-switcher">
      <div className="business-entry-switcher__segments" role="group" aria-label="Что открыто">
        <button
          type="button"
          className="business-sound-chip"
          data-checked={personOn ? "true" : "false"}
          aria-pressed={personOn}
          data-testid="biz-entry-person"
          aria-label={person || "Имя не указано"}
          onClick={() => {
            if (point) {
              setHint("Войдите со своего телефона. Это устройство только играет музыку в зале.");
              return;
            }
            setHint(null);
            setEntry("person");
          }}
        >
          <span className="business-sound-chip__label">{person || "–"}</span>
        </button>
        <button
          type="button"
          className="business-sound-chip"
          data-checked={venueOn ? "true" : "false"}
          aria-pressed={venueOn}
          data-testid="biz-entry-venue"
          onClick={() => {
            setHint(null);
            if (!point) setEntry("venue");
          }}
        >
          <span className="business-sound-chip__label">{venue}</span>
        </button>
      </div>
      {hint ? (
        <p className="business-entry-switcher__hint" role="status" data-testid="biz-entry-hint">
          {hint}{" "}
          <a href="https://audiolad.ru/auth/sign-in">Войти</a>
        </p>
      ) : null}
    </div>
  );
}
