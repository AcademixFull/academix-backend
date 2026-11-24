import { z } from "zod";

export const moderationCourseIdentifierSchema = z.object({
  courseId: z.string().uuid("El identificador del curso no es válido."),
});

export const moderateCourseSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(10, "El motivo debe tener al menos 10 caracteres.")
      .max(2000, "El motivo no puede superar 2000 caracteres."),
  })
  .strict();

export const moderationCourseListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["review", "published", "moderated"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ModerateCourseInput = z.infer<typeof moderateCourseSchema>;
export type ModerationCourseListQuery = z.infer<typeof moderationCourseListQuerySchema>;
