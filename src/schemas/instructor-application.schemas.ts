import { z } from "zod";
import { paginationFields } from "./pagination.schemas";

export const submitInstructorApplicationSchema = z.object({
  enrollmentId: z.string().trim().min(3).max(40),
  credentialReference: z.string().trim().min(5).max(500),
});

export const instructorApplicationIdentifierSchema = z.object({
  applicationId: z.string().uuid("El identificador de la solicitud no es válido."),
});

export const instructorApplicationListQuerySchema = z.object({
  ...paginationFields,
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export const resolveInstructorApplicationSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    observations: z.string().trim().max(1000).optional().default(""),
    specialty: z.string().trim().min(2).max(160).optional(),
    experienceYears: z.number().int().min(0).max(80).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "approved" && !value.specialty) {
      context.addIssue({ code: "custom", path: ["specialty"], message: "Indica la especialidad." });
    }
    if (value.decision === "approved" && value.experienceYears === undefined) {
      context.addIssue({ code: "custom", path: ["experienceYears"], message: "Indica los años de experiencia." });
    }
  });

export type InstructorApplicationListQuery = z.infer<typeof instructorApplicationListQuerySchema>;
export type SubmitInstructorApplicationInput = z.infer<typeof submitInstructorApplicationSchema>;
export type ResolveInstructorApplicationInput = z.infer<typeof resolveInstructorApplicationSchema>;
