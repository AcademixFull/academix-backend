import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import { accountDeletionRepository } from "../repositories/account-deletion.repository";
import { createAccountCleanupWorker, createAccountDeletionService } from "./account-deletion.service";

export const accountDeletionService = createAccountDeletionService(accountDeletionRepository, async (email, password) => {
  try {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  // Dispose the temporary verification session, preserving the existing session.
  if (data.session) {
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(data.session.access_token, "local");
    if (signOutError && ![401,403,404].includes(signOutError.status ?? 0)) {
      throw new AppError(502, "REAUTHENTICATION_UNAVAILABLE", "No fue posible completar la verificación de identidad.");
    }
  }
  return data.user.id;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "REAUTHENTICATION_UNAVAILABLE", "No fue posible verificar la identidad. Intenta nuevamente.");
  }
});

export const accountCleanupWorker = createAccountCleanupWorker(accountDeletionRepository, {
  async removePrivateFiles(files) {
    for (const file of files) {
      // Shared course content is deliberately excluded from deletion manifests.
      if (file.bucket === "academix-course-content" || file.path.startsWith("courses/")) {
        throw new AppError(409, "UNSAFE_STORAGE_MANIFEST", "El archivo pertenece a contenido compartido.");
      }
      const { error } = await supabaseAdmin.storage.from(file.bucket).remove([file.path]);
      if (error && String((error as { statusCode?: string }).statusCode) !== "404") {
        throw new AppError(502, "PRIVATE_FILE_DELETE_FAILED", "No fue posible limpiar los archivos privados.");
      }
    }
  },
  async deleteAuth(userId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
    if (error && error.status !== 404) {
      throw new AppError(502, "AUTH_DELETE_FAILED", "No fue posible eliminar las credenciales.");
    }
  },
});
