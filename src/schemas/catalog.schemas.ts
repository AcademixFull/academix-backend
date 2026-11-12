import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug no es válido.");

export const courseListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  category: slugSchema.optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const courseIdentifierSchema = z.object({
  courseId: z.string().trim().min(1).max(180),
});

export const instructorIdentifierSchema = z.object({
  instructorId: z.string().uuid("El identificador del instructor no es válido."),
});

export type CourseListQuery = z.infer<typeof courseListQuerySchema>;
