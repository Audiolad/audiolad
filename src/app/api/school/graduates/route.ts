import { mapCatalogProductToListingItem } from "@/lib/catalog/listing";
import { loadSchoolGraduateProducts } from "@/lib/school/graduate-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await loadSchoolGraduateProducts();
    // Same public card DTO as /api/catalog; no audio URLs or editorial metadata.
    const items = products.map((product) => {
      const { sortTimestamp: _, ...card } = mapCatalogProductToListingItem(product);
      void _;
      return card;
    });
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Витрина временно недоступна." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
