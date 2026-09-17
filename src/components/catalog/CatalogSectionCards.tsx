import Image from "next/image";
import Link from "next/link";

import {
  PUBLIC_CATALOG_SECTION_CARDS,
  type PublicCatalogSection,
} from "@/lib/catalog/catalog-sections";
import {
  buildCatalogHref,
  type CatalogHrefOptions,
} from "@/lib/catalog/topic-filter";

type CatalogSectionCardsProps = {
  activeSection: PublicCatalogSection | null;
  query: Pick<
    CatalogHrefOptions,
    "q" | "topic" | "access" | "class" | "sort"
  >;
};

export default function CatalogSectionCards({
  activeSection,
  query,
}: CatalogSectionCardsProps) {
  return (
    <nav
      aria-label="Разделы каталога"
      data-catalog-section-cards
      className="mt-0 xl:mt-1.5"
    >
      <div className="grid grid-cols-4 gap-1 sm:gap-2 xl:gap-3">
        {PUBLIC_CATALOG_SECTION_CARDS.map((section) => {
          const isActive = activeSection === section.value;
          const href = buildCatalogHref({
            ...query,
            section: isActive ? null : section.value,
          });

          return (
            <Link
              key={section.value}
              href={href}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              aria-label={`${section.label}${isActive ? ", выбранный раздел" : ""}`}
              data-catalog-section={section.value}
              className={`block min-w-0 overflow-hidden rounded-[10px] transition-[transform,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:rounded-[14px] xl:rounded-[18px] ${
                isActive
                  ? "ring-2 ring-[#7042c5]"
                  : "hover:-translate-y-0.5"
              }`}
            >
              <Image
                src={`/images/catalog-sections/catalog-section-${section.asset}-mobile.webp`}
                width={619}
                height={620}
                quality={95}
                alt=""
                sizes="25vw"
                className="block aspect-square h-auto w-full object-cover xl:hidden"
              />
              <Image
                src={`/images/catalog-sections/catalog-section-${section.asset}-desktop.webp`}
                width={1376}
                height={768}
                quality={95}
                alt=""
                sizes="(min-width: 1280px) 24vw, 25vw"
                className="hidden aspect-[43/24] h-auto w-full object-cover xl:block"
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
