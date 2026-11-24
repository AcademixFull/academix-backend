import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

const serverAuthOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
} as const;

/** Cliente para acciones que representan al usuario (registro, acceso y JWT). */
export const supabaseAuth = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY,
  serverAuthOptions
);

/** Cliente privilegiado. Nunca debe importarse desde código del frontend. */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  serverAuthOptions
);
