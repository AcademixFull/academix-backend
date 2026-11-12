import "dotenv/config";
import { z } from "zod";

/**
 * Punto central de lectura/validación de variables de entorno.
 *
 * Regla del proyecto: ningún otro archivo debe leer `process.env`
 * directamente. Todo pasa por aquí para que:
 *  - haya un único lugar que sepa qué variables existen y sus tipos;
 *  - el servidor falle al arrancar (con un mensaje claro) si falta algo
 *    crítico, en vez de fallar más tarde de forma confusa en tiempo de
 *    ejecución.
 */

const originSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.origin === value &&
      !url.username &&
      !url.password
    );
  }, "Debe ser un origen HTTP/HTTPS sin rutas, consultas ni credenciales.");

export function parseFrontendOrigins(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const parsed = z.array(originSchema).min(1).safeParse(origins);

  if (!parsed.success) {
    throw new Error(
      "FRONTEND_URL debe contener una o más URLs válidas separadas por comas."
    );
  }

  return [...new Set(parsed.data)];
}

const envSchema = z.object({
  CATALOG_CACHE_TTL_MS: z.coerce.number().int().min(100).max(3_600_000).default(30_000),
  CATALOG_CACHE_MAX_ITEMS: z.coerce.number().int().min(1).max(1000).default(128),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  FRONTEND_URL: z
    .string({ error: "FRONTEND_URL es obligatoria (se usa para configurar CORS)." })
    .min(1)
    .refine(
      (value) => {
        try {
          parseFrontendOrigins(value);
          return true;
        } catch {
          return false;
        }
      },
      "FRONTEND_URL debe contener URLs válidas separadas por comas."
    ),
  SUPABASE_URL: z.string().url("SUPABASE_URL debe ser una URL válida."),
  SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "SUPABASE_PUBLISHABLE_KEY es obligatoria." })
    .min(1),
  SUPABASE_SECRET_KEY: z
    .string({ error: "SUPABASE_SECRET_KEY es obligatoria." })
    .min(1),
  PASSWORD_RESET_REDIRECT_URL: z
    .string({ error: "PASSWORD_RESET_REDIRECT_URL es obligatoria." })
    .url("PASSWORD_RESET_REDIRECT_URL debe ser una URL válida.")
    .refine(
      (value) => ["http:", "https:"].includes(new URL(value).protocol),
      "PASSWORD_RESET_REDIRECT_URL debe usar HTTP o HTTPS."
    ),
  EMAIL_CONFIRMATION_REDIRECT_URL: z
    .string()
    .url("EMAIL_CONFIRMATION_REDIRECT_URL debe ser una URL válida.")
    .refine(
      (value) => ["http:", "https:"].includes(new URL(value).protocol),
      "EMAIL_CONFIRMATION_REDIRECT_URL debe usar HTTP o HTTPS."
    )
    .optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas o faltantes en academix-backend:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nRevisa tu archivo .env (usa .env.example como referencia).");
  process.exit(1);
}

export const env = parsed.data;
export const emailConfirmationRedirectUrl =
  env.EMAIL_CONFIRMATION_REDIRECT_URL ?? env.PASSWORD_RESET_REDIRECT_URL;
export const frontendOrigins = parseFrontendOrigins(env.FRONTEND_URL);
export const isProduction = env.NODE_ENV === "production";
