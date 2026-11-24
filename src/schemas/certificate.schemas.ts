import { z } from "zod";

export const certificateIdentifierSchema = z.object({
  certificateId: z.string().uuid("El identificador del certificado no es válido."),
});

export const credentialCodeSchema = z.object({
  credentialCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ACX-\d{4}-[A-F0-9]{12}$/, "El código de credencial no es válido."),
});
