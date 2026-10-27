import { mapCatalogProductToListingItem } from "@/lib/catalog/listing";
import { loadSchoolGraduateProducts } from "@/lib/school/graduate-queries";
import GraduateProducts from "./GraduateProducts";

export default async function SchoolGraduateShowcase({ school = false }: { school?: boolean }) {
  let cards;
  try {
    const products = await loadSchoolGraduateProducts();
    cards = products.map(mapCatalogProductToListingItem);
  } catch {
    console.error("school_graduate_showcase_unavailable");
    return null;
  }
  return <GraduateProducts cards={cards} school={school} />;
}
