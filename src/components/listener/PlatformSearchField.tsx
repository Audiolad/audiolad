"use client";

import { useId, type FormEvent, type KeyboardEvent } from "react";

type PlatformSearchFieldProps = {
  inputId?: string;
  ariaLabel: string;
  inputValue: string;
  showClearButton: boolean;
  showDropdown: boolean;
  listboxId: string;
  activeDescendantId: string | undefined;
  activeTopicKey: string | null;
  enterHref: string;
  onInputChange: (value: string) => void;
  onInputFocus: () => void;
  onInputClick: () => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFormSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClearClick: () => void;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

const formClassName =
  "relative flex min-w-0 items-center gap-2 rounded-[22px] border border-[#ded1f1] bg-white px-3 py-2 shadow-[0_2px_10px_rgba(90,60,145,0.04)] sm:gap-3 sm:px-4 sm:py-2.5 xl:h-[58px] xl:min-h-[58px] xl:gap-3 xl:rounded-[18px] xl:border-[#e8ddf5] xl:px-4 xl:py-0 xl:shadow-[0_2px_10px_rgba(90,60,145,0.04)] xl:transition-[border-color,box-shadow] xl:focus-within:border-[#dcc9f2] xl:focus-within:shadow-[0_4px_14px_rgba(90,60,145,0.07)]";

export default function PlatformSearchField({
  inputId: inputIdProp,
  ariaLabel,
  inputValue,
  showClearButton,
  showDropdown,
  listboxId,
  activeDescendantId,
  activeTopicKey,
  enterHref,
  onInputChange,
  onInputFocus,
  onInputClick,
  onInputKeyDown,
  onFormSubmit,
  onClearClick,
}: PlatformSearchFieldProps) {
  const generatedInputId = useId();
  const inputId = inputIdProp ?? generatedInputId;

  return (
    <form
      method="get"
      action={enterHref}
      role="search"
      onSubmit={onFormSubmit}
      className={formClassName}
    >
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>

      <span className="pl-0.5 text-[#7042c5] xl:pl-0 xl:text-[#9485b4]">
        <SearchIcon />
      </span>

      <input
        id={inputId}
        name="q"
        type="search"
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onFocus={onInputFocus}
        onClick={onInputClick}
        onKeyDown={onInputKeyDown}
        placeholder="Поиск практик"
        autoComplete="off"
        enterKeyHint="search"
        maxLength={100}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showDropdown ? activeDescendantId : undefined}
        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[15px] leading-normal text-[#25135c] placeholder:text-[#9485b4] focus:outline-none xl:leading-none"
      />

      {activeTopicKey ? (
        <input type="hidden" name="topic" value={activeTopicKey} />
      ) : null}

      {showClearButton ? (
        <button
          type="button"
          onClick={onClearClick}
          aria-label="Очистить поиск"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9485b4] transition hover:bg-[#faf6ff] hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:h-10 sm:w-10"
        >
          <ClearIcon />
        </button>
      ) : (
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] px-3 text-sm font-medium text-white transition hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:px-4 xl:h-9"
        >
          Найти
        </button>
      )}
    </form>
  );
}

export function PlatformSearchSkeleton() {
  return (
    <div className="relative z-30" aria-hidden="true">
      <div className={`${formClassName} animate-pulse`}>
        <div className="h-5 w-5 rounded-full bg-[#f3ebfc]" />
        <div className="h-4 flex-1 rounded bg-[#f3ebfc]" />
      </div>
    </div>
  );
}
