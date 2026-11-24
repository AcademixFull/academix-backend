import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";

const emailSchema = z.string().trim().email().toLowerCase();

export interface BootstrapAdminRepository {
  bootstrap(email: string): Promise<{ userId: string; email: string }>;
}

export const bootstrapAdminRepository: BootstrapAdminRepository = {
  async bootstrap(email) {
    const { data, error } = await supabaseAdmin.rpc("academix_bootstrap_admin", { p_email: email });
    if (error) {
      const mapped: Record<string, [number, string, string]> = {
        ADMIN_ALREADY_CONFIGURED: [409, "ADMIN_ALREADY_CONFIGURED", "Ya existe un administrador activo."],
        USER_NOT_FOUND: [404, "USER_NOT_FOUND", "Registra primero una cuenta activa con ese correo."],
        ADMIN_ROLE_NOT_FOUND: [500, "ADMIN_ROLE_NOT_FOUND", "El rol Administrador no está configurado."],
      };
      const value = mapped[error.message];
      if (value) throw new AppError(value[0], value[1], value[2]);
      throw new AppError(502, "DATABASE_ERROR", "No fue posible configurar al administrador.");
    }
    return data as { userId: string; email: string };
  },
};

export function createBootstrapAdminService(repository: BootstrapAdminRepository) {
  return {
    bootstrap(email: string) {
      return repository.bootstrap(emailSchema.parse(email));
    },
  };
}

export const bootstrapAdminService = createBootstrapAdminService(bootstrapAdminRepository);
