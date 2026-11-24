import { z } from "zod";

const email = z.string().trim().email("El correo electrónico no es válido.").toLowerCase();
const password = z
  .string()
  .min(8, "La contraseña debe contener al menos 8 caracteres.")
  .max(72, "La contraseña no puede superar 72 caracteres.");
const name = z.string().trim().min(1).max(100);

export const signUpSchema = z.object({
  email,
  password,
  fullName: name,
});

export const signInSchema = z.object({ email, password });

export const passwordResetSchema = z.object({ email });
export const updatePasswordSchema = z.object({ password }).strict();

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
