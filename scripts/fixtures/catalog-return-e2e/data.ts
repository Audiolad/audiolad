import type { CatalogCard } from "@/lib/catalog/dto";

export const E2E_PAGE_SIZE = 12;
const TOTAL = 150;

export type E2eQuery = { q: string; access: string; sort: string };

function makeCard(n: number): CatalogCard {
  const id = `e2e-${String(n).padStart(3, "0")}`;
  const free = n % 2 === 0;
  return {
    publication_id: id,
    class: "practice",
    slug: id,
    title: `Аудио ${n} ${n % 3 === 0 ? "сон" : "покой"}`,
    subtitle: null,
    cover: { url: null, alt: `Обложка ${n}` },
    gallery: [],
    author: { name: "Автор", slug: "author" },
    topics: [],
    display_label: "Практика",
    duration_seconds: 600,
    published_at: "2026-01-01T00:00:00.000Z",
    paths: { pdp: `/p/${id}` },
    default_offer: free
      ? { access: "free", claim: "free_claim", price: null }
      : { access: "paid", price: { amount_minor: n * 1000, currency: "RUB" } },
    viewer: { can_listen: false, has_grant: false, is_saved: false },
    badges: [],
    progress: null,
    summary: {},
  } as CatalogCard;
}

export function e2eList(query: E2eQuery): CatalogCard[] {
  let cards = Array.from({ length: TOTAL }, (_, i) => makeCard(TOTAL - i));
  const q = query.q.trim().toLowerCase();
  if (q) cards = cards.filter((c) => c.title.toLowerCase().includes(q));
  if (query.access === "free") cards = cards.filter((c) => c.default_offer?.access === "free");
  if (query.access === "paid") cards = cards.filter((c) => c.default_offer?.access === "paid");
  const price = (c: CatalogCard) =>
    c.default_offer?.access === "paid" ? c.default_offer.price.amount_minor : 0;
  if (query.sort === "price_asc") cards = [...cards].sort((a, b) => price(a) - price(b) || a.title.localeCompare(b.title));
  if (query.sort === "price_desc") cards = [...cards].sort((a, b) => price(b) - price(a) || a.title.localeCompare(b.title));
  return cards;
}

export function e2ePage(query: E2eQuery, cursor: string | null) {
  const all = e2eList(query);
  const offset = cursor ? Number(cursor.replace("c:", "")) || 0 : 0;
  const items = all.slice(offset, offset + E2E_PAGE_SIZE);
  const next = offset + E2E_PAGE_SIZE;
  return { items, nextCursor: next < all.length ? `c:${next}` : null };
}
