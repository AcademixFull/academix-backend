import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type { AccountDeletion, AccountDeletionRepository } from "../services/account-deletion.service";

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) {
    const messages: Record<string, string> = {
      DELETION_DEADLINE_PASSED: "El plazo para cancelar la eliminación ya terminó.",
      SHARED_RESOURCE_OWNERSHIP: "Antes de eliminar tu cuenta debes transferir la responsabilidad de tus organizaciones o recursos compartidos.",
      LAST_ADMINISTRATOR: "Otro administrador debe asumir la administración antes de eliminar tu cuenta.",
    };
    if (messages[error.message]) throw new AppError(409, error.message, messages[error.message]!);
    if (error.message === "LEASE_LOST") throw new AppError(409, "LEASE_LOST", "La ejecución fue reemplazada por otro proceso.");
    if (error.message === "UNSUPPORTED_DELETION_RELATION") {
      const relation = /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(error.details ?? "") ? error.details : "unknown";
      throw new AppError(409, "UNSUPPORTED_DELETION_RELATION", "La eliminación requiere revisar una relación de datos antes de continuar.", { relation });
    }
    throw new AppError(502, "ACCOUNT_DELETION_DATABASE_ERROR", "No fue posible procesar la solicitud de eliminación.");
  }
  return data as T;
}
export const accountDeletionRepository: AccountDeletionRepository = {
  get: (userId) => rpc<AccountDeletion | null>("academix_get_account_deletion", { p_user_id: userId }),
  request: (userId) => rpc<AccountDeletion>("academix_request_account_deletion", { p_user_id: userId }),
  cancel: async (userId) => { await rpc("academix_cancel_account_deletion", { p_user_id: userId }); },
  claim: () => rpc("academix_claim_account_deletions"),
  prepare: (job) => rpc("academix_prepare_account_deletion", { p_request_id: job.id, p_lease: job.leaseToken }),
  finish: async (job) => { await rpc("academix_finish_account_deletion", { p_request_id: job.id, p_lease: job.leaseToken }); },
  fail: async (job, code, relation) => { await rpc("academix_retry_account_deletion", { p_request_id: job.id, p_lease: job.leaseToken, p_code: code, p_relation: relation ?? null }); },
};
