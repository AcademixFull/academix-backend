import { z } from "zod";

export const paginationFields = {
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
export const activeFilter = z.enum(["true", "false"]).transform((value) => value === "true").optional();
export const listQuerySchema = z.object({
  ...paginationFields,
  search: z.string().trim().min(1).max(100).optional(),
  active: activeFilter,
});
export type ListQuery = z.infer<typeof listQuerySchema>;
