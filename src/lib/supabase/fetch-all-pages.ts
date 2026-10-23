/** The callback must build a fresh query with a deterministic order for every page. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  pageSize = 1000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to load page at ${from}: ${error.message}`);
    if (!data) throw new Error(`Missing page data at ${from}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
