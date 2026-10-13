import Link from "next/link";

import CatalogProductGrid from "@/components/products/CatalogProductGrid";
import { e2ePage, E2E_PAGE_SIZE } from "@/app/e2e-data";
import SearchBox from "./SearchBox";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; access?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const query = { q: sp.q ?? "", access: sp.access ?? "all", sort: sp.sort ?? "new" };
  const listing = e2ePage(query, null);
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { ...query, ...patch };
    if (merged.q) p.set("q", merged.q);
    if (merged.access !== "all") p.set("access", merged.access);
    if (merged.sort !== "new") p.set("sort", merged.sort);
    const s = p.toString();
    return s ? `/catalog?${s}` : "/catalog";
  };

  return (
    <main className="px-2.5 pb-24">
      <h1>Каталог (e2e)</h1>
      <SearchBox initial={query.q} />
      <nav data-testid="filters" className="flex gap-3 py-2 text-sm">
        <Link replace data-testid="f-all" href={href({ access: "all" })}>Все</Link>
        <Link replace data-testid="f-free" href={href({ access: "free" })}>Бесплатные</Link>
        <Link replace data-testid="s-asc" href={href({ sort: "price_asc" })}>Цена ↑</Link>
        <Link replace data-testid="s-desc" href={href({ sort: "price_desc" })}>Цена ↓</Link>
        <Link data-testid="nav-fresh" href="/catalog">Каталог (вкладка)</Link>
        <Link data-testid="nav-other" href="/p/other">Другая страница</Link>
      </nav>
      <CatalogProductGrid
        key={`${query.q}|${query.access}|${query.sort}`}
        initialItems={listing.items}
        initialNextCursor={listing.nextCursor}
        query={{
          q: query.q,
          topic: null,
          section: null,
          access: query.access as never,
          class: "all",
          sort: query.sort as never,
          limit: E2E_PAGE_SIZE,
        }}
        emptyState={<p>Пусто</p>}
      />
    </main>
  );
}
