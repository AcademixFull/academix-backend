import { AppError } from "../errors/app-error";

export interface AccountDeletion {
  id: string; userId: string; requestedAt: string; deleteAfter: string;
  status: "pending" | "processing" | "cancelled" | "completed";
}
export interface CleanupJob extends AccountDeletion { leaseToken: string }
export interface PrivateFile { bucket: string; path: string }
export interface AccountDeletionRepository {
  get(userId: string): Promise<AccountDeletion | null>;
  request(userId: string): Promise<AccountDeletion>;
  cancel(userId: string): Promise<void>;
  claim(): Promise<CleanupJob[]>;
  prepare(job: CleanupJob): Promise<PrivateFile[]>;
  finish(job: CleanupJob): Promise<void>;
  fail(job: CleanupJob, code: string, relation?: string): Promise<void>;
}
export function createAccountDeletionService(repository: AccountDeletionRepository, reauthenticate: (email: string, password: string) => Promise<string | null>) {
  return {
    get: (userId: string) => repository.get(userId),
    cancel: (userId: string) => repository.cancel(userId),
    async request(user: { id: string; email: string }, password: string) {
      if (await reauthenticate(user.email, password) !== user.id) {
        throw new AppError(401, "REAUTHENTICATION_FAILED", "No pudimos verificar tu contraseña actual.");
      }
      return repository.request(user.id);
    },
  };
}
export function createAccountCleanupWorker(repository: AccountDeletionRepository, privacy: {
  removePrivateFiles(files: PrivateFile[]): Promise<void>;
  deleteAuth(userId: string): Promise<void>;
}) {
  return {
    async run() {
      let completed = 0; let failed = 0;
      for (const job of await repository.claim()) {
        try {
          const files = await repository.prepare(job);
          await privacy.removePrivateFiles(files);
          await privacy.deleteAuth(job.userId);
          await repository.finish(job);
          completed += 1;
        } catch (error) {
          // Never persist passwords, provider error bodies, email or object paths.
          const code = error instanceof AppError ? error.code : "CLEANUP_FAILED";
          const relation = error instanceof AppError && typeof error.fields?.relation === "string" ? error.fields.relation : undefined;
          if (relation) await repository.fail(job, code, relation);
          else await repository.fail(job, code);
          failed += 1;
        }
      }
      return { completed, failed };
    },
  };
}
