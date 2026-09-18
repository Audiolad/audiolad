import type {
  CatalogSection,
  CatalogSectionFilter,
} from "@/lib/catalog/catalog-sections";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminCatalogSectionProduct = {
  id: string;
  title: string;
  authorName: string;
  authorSlug: string;
  format: string | null;
  catalogSection: CatalogSection | null;
  createdAt: string;
};

const PAGE_SIZE = 1000;

export async function listAdminCatalogSectionProducts(input: {
  filter: CatalogSectionFilter;
}): Promise<AdminCatalogSectionProduct[]> {
  const supabase = createServiceRoleClient();
  const rows: Array<Record<string, unknown>> = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("practices")
      .select(`
        id,
        title,
        format,
        catalog_section,
        created_at,
        author_id,
        authors!practices_author_id_fkey (
          id,
          name,
          slug
        )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (input.filter === "unassigned") {
      query = query.is("catalog_section", null);
    } else if (input.filter !== "all") {
      query = query.eq("catalog_section", input.filter);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`catalog_sections_list_failed:${error.message}`);
    }

    const pageRows = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      break;
    }
  }

  return rows.map((row) => {
    const rawAuthor = row.authors;
    const author = Array.isArray(rawAuthor) ? rawAuthor[0] : rawAuthor;
    const mappedAuthor =
      author && typeof author === "object"
        ? (author as Record<string, unknown>)
        : null;

    const rawSection =
      typeof row.catalog_section === "string" ? row.catalog_section : null;

    return {
      id: String(row.id ?? ""),
      title:
        typeof row.title === "string" && row.title.trim()
          ? row.title
          : "Без названия",
      authorName:
        typeof mappedAuthor?.name === "string" && mappedAuthor.name.trim()
          ? mappedAuthor.name
          : "Автор",
      authorSlug:
        typeof mappedAuthor?.slug === "string" ? mappedAuthor.slug : "",
      format: typeof row.format === "string" ? row.format : null,
      catalogSection:
        rawSection === "music" ||
        rawSection === "meditations" ||
        rawSection === "education" ||
        rawSection === "stories" ||
        rawSection === "books"
          ? rawSection
          : null,
      createdAt:
        typeof row.created_at === "string" ? row.created_at : "",
    };
  });
}
