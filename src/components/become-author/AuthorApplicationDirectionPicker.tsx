"use client";

import {
  AUTHOR_DIRECTION_OTHER,
  AUTHOR_DIRECTION_PRESETS,
  AUTHOR_APPLICATION_LIMITS,
} from "@/lib/author-applications/validation";

import {
  becomeAuthorBodyClass,
  becomeAuthorCheckboxCardClass,
  becomeAuthorInputClass,
  becomeAuthorLabelClass,
} from "./typography";

type AuthorApplicationDirectionPickerProps = {
  selectedDirections: string[];
  directionOther: string;
  directionError?: string;
  directionOtherError?: string;
  onSelectedDirectionsChange: (next: string[]) => void;
  onDirectionOtherChange: (next: string) => void;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="mt-2 text-[15px] leading-snug text-[#b34f63]" role="alert">
      {message}
    </p>
  );
}

export default function AuthorApplicationDirectionPicker({
  selectedDirections,
  directionOther,
  directionError,
  directionOtherError,
  onSelectedDirectionsChange,
  onDirectionOtherChange,
}: AuthorApplicationDirectionPickerProps) {
  const showOther = selectedDirections.includes(AUTHOR_DIRECTION_OTHER);

  function toggleDirection(option: string, checked: boolean) {
    if (checked) {
      onSelectedDirectionsChange([...new Set([...selectedDirections, option])]);
      return;
    }

    onSelectedDirectionsChange(
      selectedDirections.filter((item) => item !== option),
    );
  }

  return (
    <fieldset
      className="space-y-3"
      aria-describedby={
        directionError || directionOtherError
          ? "direction-error directionOther-error"
          : undefined
      }
    >
      <legend className={becomeAuthorLabelClass}>
        В каком направлении вы работаете?{" "}
        <span className="text-[#b34f63]">*</span>
      </legend>

      <div className="grid grid-cols-1 gap-2">
        {AUTHOR_DIRECTION_PRESETS.map((option) => (
          <label key={option} className={becomeAuthorCheckboxCardClass}>
            <input
              type="checkbox"
              name="directionOptions"
              value={option}
              checked={selectedDirections.includes(option)}
              onChange={(event) =>
                toggleDirection(option, event.currentTarget.checked)
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#7042c5]"
            />
            <span className={`${becomeAuthorBodyClass} text-[#25135c]`}>
              {option}
            </span>
          </label>
        ))}
      </div>

      {showOther ? (
        <div>
          <label htmlFor="directionOther" className={becomeAuthorLabelClass}>
            Укажите направление
          </label>
          <input
            id="directionOther"
            name="directionOther"
            type="text"
            maxLength={AUTHOR_APPLICATION_LIMITS.directionOtherMax}
            value={directionOther}
            onChange={(event) => onDirectionOtherChange(event.currentTarget.value)}
            aria-invalid={Boolean(directionOtherError)}
            aria-describedby={
              directionOtherError ? "directionOther-error" : undefined
            }
            className={becomeAuthorInputClass}
          />
          <FieldError id="directionOther-error" message={directionOtherError} />
        </div>
      ) : null}

      <FieldError id="direction-error" message={directionError} />
    </fieldset>
  );
}
