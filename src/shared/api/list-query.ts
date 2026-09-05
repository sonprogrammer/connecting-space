export type ListQueryOptions = {
  sortFields: readonly string[];
};

export type ListQuery = {
  q: string;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
};

export function parseListQuery(params: URLSearchParams, options: ListQueryOptions):
  | { ok: true; value: ListQuery }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const rawPage = params.get("page");
  const rawPageSize = params.get("pageSize");
  const page = rawPage === null ? 1 : Number(rawPage);
  const pageSize = rawPageSize === null ? 20 : Number(rawPageSize);
  const sort = params.get("sort") || options.sortFields[0];
  const direction = params.get("direction") || "desc";

  if (!Number.isInteger(page) || page < 1) errors.push("page must be a positive integer");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) errors.push("pageSize must be between 1 and 100");
  if (!sort || !options.sortFields.includes(sort)) errors.push(`sort must be one of: ${options.sortFields.join(", ")}`);
  if (direction !== "asc" && direction !== "desc") errors.push("direction must be asc or desc");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: { q: params.get("q")?.trim() || "", page, pageSize, sort: sort!, direction: direction as "asc" | "desc" },
  };
}

export function paginatedResponse<T>(items: T[], total: number, query: ListQuery) {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}
