import type { HomeProduct } from "@/lib/home/types";

import HomeProductCard from "./HomeProductCard";
import HomeSectionHeader from "./HomeSectionHeader";

type ProductRailProps = {
  title: string;
  products: HomeProduct[];
  ariaLabel: string;
  href?: string;
  linkLabel?: string;
  showGiftBadge?: boolean;
  showGiftProductLabel?: boolean;
};

export default function ProductRail({
  title,
  products,
  ariaLabel,
  href,
  linkLabel,
  showGiftBadge = true,
  showGiftProductLabel = false,
}: ProductRailProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="home-section-carousel mt-8" aria-label={ariaLabel}>
      <HomeSectionHeader title={title} href={href} linkLabel={linkLabel} />

      <div className="home-carousel-track catalog-carousel mt-4 flex gap-3 overflow-x-auto pb-1">
        {products.map((product) => (
          <div key={product.id} data-catalog-carousel-item>
            <HomeProductCard
              product={product}
              showGiftBadge={showGiftBadge}
              showGiftProductLabel={showGiftProductLabel}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
