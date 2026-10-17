"use client";

import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";

/**
 * a8240527 — sound settings of a point in the AudioLad Business cabinet: venue character,
 * music direction and time of day. One component for the guest and for the venue owner
 * (Music section). The parameters pick the collections the player plays right away.
 */
function ChipGroup<T extends { id: string; label: string; hint?: string }>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: string;
  onChange: (id: T["id"]) => void;
}) {
  const compact = options.every((o) => !o.hint && o.label.length <= 9);
  return (
    <fieldset className="business-sound-group">
      <legend className="business-sound-group__legend">{legend}</legend>
      <div className={compact ? "business-sound-chips business-sound-chips--compact" : "business-sound-chips"}>
        {options.map((option) => (
          <label key={option.id} className="business-sound-chip" data-checked={option.id === value ? "true" : undefined}>
            <input type="radio" name={name} value={option.id} checked={option.id === value} onChange={() => onChange(option.id)} />
            <span className="business-sound-chip__label">{option.label}</span>
            {option.hint ? <span className="business-sound-chip__hint">{option.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function BusinessSoundSettings({
  profile,
  onChange,
  note,
}: {
  profile: GuestCoffeeProfile;
  onChange: <K extends keyof GuestCoffeeProfile>(key: K, value: GuestCoffeeProfile[K]) => void;
  note?: string;
}) {
  return (
    <section className="business-app-card business-sound-settings" aria-labelledby="business-sound-settings-title" data-testid="biz-sound-settings">
      <h2 id="business-sound-settings-title" className="text-[1.15rem] font-bold text-[var(--biz-text)]">
        Настройки звучания
      </h2>
      <ChipGroup legend="Характер заведения" name="biz-sound-character" options={GUEST_COFFEE_CHARACTERS} value={profile.character} onChange={(id) => onChange("character", id)} />
      <ChipGroup legend="Музыкальное направление" name="biz-sound-direction" options={GUEST_COFFEE_DIRECTIONS} value={profile.direction} onChange={(id) => onChange("direction", id)} />
      <ChipGroup legend="Время суток" name="biz-sound-daypart" options={GUEST_COFFEE_DAYPARTS} value={profile.daypart} onChange={(id) => onChange("daypart", id)} />
      <p className="mt-3 text-sm text-[var(--biz-text-muted)]">
        Меняйте настройки в любой момент – подборки обновляются сразу, музыка не прерывается.
        {note ? ` ${note}` : ""}
      </p>
    </section>
  );
}
