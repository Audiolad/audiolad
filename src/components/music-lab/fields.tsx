"use client";

type Option = { id: string; label: string };

export function FieldLegend({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <p className="text-base font-semibold text-[#25135c]">{title}</p>
      {hint ? <p className="mt-1 text-sm text-[#796ba0]">{hint}</p> : null}
    </div>
  );
}

export function RadioChoices({
  name,
  options,
  value,
  disabled,
  onChange,
}: {
  name: string;
  options: readonly Option[];
  value: string | null;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <label
            key={option.id}
            className={`min-h-11 cursor-pointer rounded-full border px-4 py-2 text-sm ${
              selected
                ? "border-[#7042c5] bg-[#f3ebff] text-[#25135c]"
                : "border-[#e4d7f4] bg-white text-[#4d3f73]"
            } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
          >
            <input
              className="sr-only"
              type="radio"
              name={name}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.id)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export function MultiChoices({
  options,
  selected,
  disabled,
  limit,
  onToggle,
}: {
  options: readonly Option[];
  selected: readonly string[];
  disabled: boolean;
  limit?: number;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option.id);
        const blocked = Boolean(limit && !active && selected.length >= limit);
        return (
          <label
            key={option.id}
            className={`min-h-11 cursor-pointer rounded-full border px-4 py-2 text-sm ${
              active
                ? "border-[#7042c5] bg-[#f3ebff] text-[#25135c]"
                : "border-[#e4d7f4] bg-white text-[#4d3f73]"
            } ${disabled || blocked ? "cursor-not-allowed opacity-70" : ""}`}
          >
            <input
              className="sr-only"
              type="checkbox"
              checked={active}
              disabled={disabled || blocked}
              onChange={() => onToggle(option.id)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export function UncertainToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-[#25135c]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      Не уверен
    </label>
  );
}
