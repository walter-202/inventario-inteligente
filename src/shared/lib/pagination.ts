export const SUPABASE_PAGE_SIZE = 1000;

/** Fetches every page while retaining deterministic ordering in the caller. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const pageRows = await fetchPage(page * pageSize, page * pageSize + pageSize - 1);
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
}
