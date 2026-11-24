import { z } from "zod";

const uuid = z.string().uuid("El identificador no es válido.");
const positivePosition = z.number().int().min(1).max(10_000);

export const courseContentIdentifierSchema = z.object({ courseId: uuid });
export const moduleIdentifierSchema = z.object({ moduleId: uuid });
export const authoringLessonIdentifierSchema = z.object({ lessonId: uuid });
export const resourceIdentifierSchema = z.object({ resourceId: uuid });
export const lessonResourceIdentifierSchema = z.object({ lessonId: uuid, resourceId: uuid });

export const createModuleSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(4000).default(""),
  position: positivePosition,
}).strict();

export const updateModuleSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(4000).optional(),
  position: positivePosition.optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Debes enviar al menos un campo.");

export const createLessonSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(4000).default(""),
  content: z.string().trim().max(100_000).default(""),
  durationMinutes: z.number().int().min(0).max(100_000).default(0),
  position: positivePosition,
  isPreview: z.boolean().default(false),
}).strict();

export const updateLessonSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(4000).optional(),
  content: z.string().trim().max(100_000).optional(),
  durationMinutes: z.number().int().min(0).max(100_000).optional(),
  position: positivePosition.optional(),
  isPreview: z.boolean().optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Debes enviar al menos un campo.");

const resourceFields = {
  typeId: z.number().int().positive(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(4000).default(""),
  url: z.string().trim().url().max(2000).nullable().default(null),
  fileId: uuid.nullable().default(null),
  required: z.boolean().default(false),
  position: positivePosition,
};

export const createResourceSchema = z.object(resourceFields).strict().refine(
  (value) => Number(value.url !== null) + Number(value.fileId !== null) === 1,
  "El recurso debe indicar una URL o un archivo, pero no ambos."
);

export const updateResourceSchema = z.object({
  typeId: resourceFields.typeId.optional(),
  title: resourceFields.title.optional(),
  description: z.string().trim().max(4000).optional(),
  url: z.string().trim().url().max(2000).nullable().optional(),
  fileId: uuid.nullable().optional(),
  required: z.boolean().optional(),
  position: positivePosition.optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Debes enviar al menos un campo.");

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
