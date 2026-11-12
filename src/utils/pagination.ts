export function pageResult<T>(records: T[], total: number, page: number, limit: number) {
  return { items: records, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}
