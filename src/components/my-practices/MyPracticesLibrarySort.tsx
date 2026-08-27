"use client";

import {
  LIBRARY_SORT_OPTIONS,
  type LibrarySortId,
} from "@/lib/library/unified-query";

type MyPracticesLibrarySortProps = {
  sort: LibrarySortId;
  onChange: (sort: LibrarySortId) => void;
};

export default function MyPracticesLibrarySort({
  sort,
  onChange,
}: MyPracticesLibrarySortProps) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Сортировка</span>
      <select
        data-library-sort
        value={sort}
        onChange={(event) => onChange(event.target.value as LibrarySortId)}
        className="appearance-none bg-transparent pr-4 text-sm font-medium text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        {LIBRARY_SORT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 text-sm font-medium text-[#7042c5]"
      >
        ⌄
      </span>
    </label>
  );
}
