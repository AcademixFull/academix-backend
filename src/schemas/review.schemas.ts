import { z } from "zod";

export const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(10).max(2000),
  })
  .strict();

export const reviewIdentifierSchema = z.object({
  reviewId: z.string().uuid("El identificador de la reseña no es válido."),
});

export const reviewCourseIdentifierSchema = z.object({
  courseId: z.string().uuid("El identificador del curso no es válido."),
});

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const adminReviewListQuerySchema = reviewListQuerySchema.extend({
  visibility: z.enum(["all", "visible", "hidden"]).default("all"),
  courseId: z.string().uuid("El identificador del curso no es válido.").optional(),
});

export const moderateReviewSchema = z
  .object({
    visible: z.boolean(),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.visible && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Debes indicar el motivo para ocultar una reseña.",
      });
    }
  });

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;
