import Link from "next/link";

type CatalogChipOption = {
  value: string;
  label: string;
};

type CatalogChipFilterBarProps = {
  ariaLabel: string;
  title?: string;
  options: readonly CatalogChipOption[];
  activeValue: string;
  buildHref: (value: string) => string;
};

export default function CatalogChipFilterBar({
  ariaLabel,
  title,
  options,
  activeValue,
  buildHref,
}: CatalogChipFilterBarProps) {
  return (
    <nav className="mt-3" aria-label={ariaLabel}>
      {title ? (
        <h3 className="text-sm font-semibold text-[#25135c]">{title}</h3>
      ) : null}
      <div
        className={`flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden${
          title ? " mt-2" : ""
        }`}
      >
        {options.map((option) => {
          const isActive = option.value === activeValue;

          return (
            <Link
              key={option.value}
              href={buildHref(option.value)}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
