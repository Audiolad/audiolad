"use client";

import { useState } from "react";

import {
  AUTHOR_DIRECTION_OTHER,
  AUTHOR_DIRECTION_PRESETS,
} from "@/lib/author-applications/validation";
import { AUTHOR_APPLICATION_LIMITS } from "@/lib/author-applications/validation";

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
}: AuthorApplicationDirectionPickerProps) {
  const [showOther, setShowOther] = useState(
    selectedDirections.includes(AUTHOR_DIRECTION_OTHER),
  );

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
              defaultChecked={selectedDirections.includes(option)}
              onChange={
                option === AUTHOR_DIRECTION_OTHER
                  ? (event) => setShowOther(event.currentTarget.checked)
                  : undefined
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
            defaultValue={directionOther}
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
