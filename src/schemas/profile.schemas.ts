import { z } from "zod";

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().max(30).optional(),
    country: z.string().trim().max(100).optional(),
    bio: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debes enviar al menos un campo para actualizar.",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
