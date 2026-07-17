function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m16.5 16.5 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LibraryMobileHeader() {
  return (
    <div className="px-5 pt-6 xl:hidden">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold">Аудиотека</h1>
          <p className="mt-1 text-sm text-[#7d70a2]">
            Ваши подарки и купленные материалы
          </p>
        </div>

        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="Поиск"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] opacity-60"
        >
          <SearchIcon />
        </button>
      </header>
    </div>
  );
}
