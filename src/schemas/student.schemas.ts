import { z } from "zod";

export const libraryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["in_progress", "completed"]).optional(),
  courseIds: z.string().transform((value) => value.split(","))
    .pipe(z.array(z.string().uuid()).min(1).max(50)).optional(),
});
export type LibraryListQuery = z.infer<typeof libraryListQuerySchema>;

export const simulatedCheckoutSchema = z.object({
  courseIds: z.array(z.string().uuid()).min(1).max(50)
    .refine((ids) => new Set(ids).size === ids.length, "El carrito contiene cursos duplicados."),
  idempotencyKey: z.string().uuid(),
}).strict();

export const enrollmentCourseIdentifierSchema = z.object({
  courseId: z.string().uuid("El identificador del curso no es válido."),
});

export const lessonIdentifierSchema = z.object({
  lessonId: z.string().uuid("El identificador de la lección no es válido."),
});

export const updateLessonProgressSchema = z
  .object({ completed: z.boolean() })
  .strict();
