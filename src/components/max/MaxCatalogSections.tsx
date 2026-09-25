"use client";

import Image from "next/image";

import {
  PUBLIC_CATALOG_SECTION_CARDS,
  type PublicCatalogSection,
} from "@/lib/catalog/catalog-sections";

type MaxCatalogSectionsProps = {
  activeSection: PublicCatalogSection | null;
  onSelectSection: (section: PublicCatalogSection | null) => void;
};

export default function MaxCatalogSections({
  activeSection,
  onSelectSection,
}: MaxCatalogSectionsProps) {
  return (
    <nav
      aria-label="Разделы каталога"
      data-max-catalog-sections
      className="mt-4"
    >
      <div className="grid grid-cols-4 gap-1">
        {PUBLIC_CATALOG_SECTION_CARDS.map((section) => {
          const isActive = activeSection === section.value;

          return (
            <button
              key={section.value}
              type="button"
              aria-pressed={isActive}
              aria-label={section.label}
              data-catalog-section={section.value}
              onClick={() => onSelectSection(isActive ? null : section.value)}
              className={`block aspect-square w-full min-w-0 overflow-hidden rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                isActive ? "ring-2 ring-[#7042c5]" : ""
              }`}
            >
              <Image
                src={`/images/catalog-sections/catalog-section-${section.asset}-mobile.webp`}
                width={619}
                height={620}
                quality={95}
                alt=""
                sizes="25vw"
                className="block aspect-square h-auto w-full object-cover"
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
