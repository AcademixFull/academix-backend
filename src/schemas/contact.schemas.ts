import { z } from "zod";

export const submitContactMessageSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(254),
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(12).max(4000),
  })
  .strict();

export type SubmitContactMessageInput = z.infer<typeof submitContactMessageSchema>;
