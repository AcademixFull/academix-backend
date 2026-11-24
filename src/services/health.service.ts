import { supabaseAdmin } from "../config/supabase";

/** Consulta mínima, de solo lectura, para comprobar Postgres/PostgREST. */
export async function checkSupabaseReadiness(): Promise<void> {
  const { error } = await supabaseAdmin.from("roles").select("id_rol").limit(1);

  if (error) {
    throw new Error("Database readiness check failed", { cause: error });
  }
}
