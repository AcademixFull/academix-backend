import { z } from "zod";
import { activeFilter, paginationFields } from "./pagination.schemas";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug no es válido.");

export const userListQuerySchema = z.object({
  sort: z.enum(["name", "email", "createdAt"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["student", "instructor", "moderator", "admin", "institutional_administrator"]).optional(),
  active: activeFilter,
  ...paginationFields,
});

export const userIdentifierSchema = z.object({
  userId: z.string().uuid("El identificador del usuario no es válido."),
});

export const setUserStatusSchema = z.object({ active: z.boolean() }).strict();

export const setUserRolesSchema = z.object({
  roles: z
    .array(z.enum(["student", "instructor", "moderator", "admin"]))
    .min(1)
    .max(4)
    .refine((roles) => new Set(roles).size === roles.length, "Los roles no deben repetirse."),
});

export const upsertInstructorSchema = z.object({
  specialty: z.string().trim().min(2).max(160),
  experienceYears: z.number().int().min(0).max(80),
});

export const categoryIdentifierSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(1000).optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(1000).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debes enviar al menos un campo para actualizar.",
  });

const courseFields = {
  title: z.string().trim().min(3).max(180),
  slug: slugSchema.optional(),
  shortDescription: z.string().trim().max(300).default(""),
  description: z.string().trim().max(20_000).default(""),
  learningOutcomes: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  requirements: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  targetAudience: z.string().trim().max(2000).default(""),
  categoryId: z.number().int().positive(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  modality: z.enum(["self_paced", "live", "blended"]),
  language: z.string().trim().toLowerCase().min(2).max(5),
  durationHours: z.number().positive().max(10_000).nullable().default(null),
  price: z.number().nonnegative().max(10_000_000).default(0),
  certificateEnabled: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  featuredVisible: z.boolean().optional(),
  organizationId: z.string().uuid("El identificador de la organización no es válido.").nullable().optional(),
};

export const createCourseSchema = z.object(courseFields).strict();

export const updateCourseSchema = z
  .object({
    title: courseFields.title.optional(),
    slug: courseFields.slug,
    shortDescription: courseFields.shortDescription.optional(),
    description: courseFields.description.optional(),
    learningOutcomes: courseFields.learningOutcomes.optional(),
    requirements: courseFields.requirements.optional(),
    targetAudience: courseFields.targetAudience.optional(),
    categoryId: courseFields.categoryId.optional(),
    level: courseFields.level.optional(),
    modality: courseFields.modality.optional(),
    language: courseFields.language.optional(),
    durationHours: courseFields.durationHours.optional(),
    price: courseFields.price.optional(),
    certificateEnabled: courseFields.certificateEnabled.optional(),
    requiresApproval: courseFields.requiresApproval.optional(),
    featuredVisible: courseFields.featuredVisible,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debes enviar al menos un campo para actualizar.",
  });

export const managedCourseIdentifierSchema = z.object({
  courseId: z.string().uuid("El identificador del curso no es válido."),
});

export const assignInstructorSchema = z.object({
  instructorId: z.string().uuid("El identificador del instructor no es válido."),
});

export const managedCourseListQuerySchema = z.object({
  scope: z.enum(["external", "institutional"]).optional(),
  organizationId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["draft", "review", "published", "archived", "moderated"]).optional(),
  ...paginationFields,
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;
export type UpsertInstructorInput = z.infer<typeof upsertInstructorSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ManagedCourseListQuery = z.infer<typeof managedCourseListQuerySchema>;
