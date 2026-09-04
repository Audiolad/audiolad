"use client";

import { type FormEvent } from "react";

type MyPracticesLibrarySearchProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
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

export default function MyPracticesLibrarySearch({
  id,
  value,
  onChange,
  onSubmit,
}: MyPracticesLibrarySearchProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      role="search"
      data-library-search
      onSubmit={handleSubmit}
      className="relative flex h-[52px] min-h-[52px] max-h-[56px] min-w-0 items-center gap-2 rounded-[18px] border border-[#ded1f1] bg-white px-3 shadow-[0_2px_10px_rgba(90,60,145,0.04)] focus-within:border-[#dcc9f2] focus-within:shadow-[0_4px_14px_rgba(90,60,145,0.07)]"
    >
      <label className="sr-only" htmlFor={id}>
        Поиск по аудиотеке
      </label>
      <span className="pl-0.5 text-[#7042c5]">
        <SearchIcon />
      </span>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Поиск по аудиотеке"
        autoComplete="off"
        enterKeyHint="search"
        maxLength={100}
        className="min-w-0 flex-1 border-0 bg-transparent py-0 text-base leading-normal text-[#25135c] placeholder:text-[#9485b4] focus:outline-none"
      />
    </form>
  );
}
