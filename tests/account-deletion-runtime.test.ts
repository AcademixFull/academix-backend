import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), storage: vi.fn(), remove: vi.fn(), deleteUser: vi.fn(),
  repo: { get: vi.fn(), request: vi.fn(), cancel: vi.fn(), claim: vi.fn(), prepare: vi.fn(), finish: vi.fn(), fail: vi.fn() },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: { auth: { admin: { signOut: mocks.signOut, deleteUser: mocks.deleteUser } }, storage: { from: mocks.storage } } }));
vi.mock("../src/repositories/account-deletion.repository", () => ({ accountDeletionRepository: mocks.repo }));
import { accountCleanupWorker, accountDeletionService } from "../src/services/account-deletion.runtime";
const user = { id: "test-user", email: "test@example.test" };
const job = { id: "request", userId: user.id, leaseToken: "lease" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.createClient.mockReturnValue({ auth: { signInWithPassword: mocks.signIn } });
  mocks.signIn.mockResolvedValue({ data: { user, session: { access_token: "temporary-verification-session" } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null }); mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.storage.mockReturnValue({ remove: mocks.remove }); mocks.remove.mockResolvedValue({ error: null });
  mocks.repo.claim.mockResolvedValue([job]); mocks.repo.prepare.mockResolvedValue([]);
});
describe("isolated reauthentication and private cleanup adapters", () => {
  it("creates a fresh nonpersistent client and revokes only its temporary session", async () => {
    await accountDeletionService.request(user, "current-password");
    expect(mocks.createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } });
    expect(mocks.signIn).toHaveBeenCalledWith({ email: user.email, password: "current-password" });
    expect(mocks.signOut).toHaveBeenCalledWith("temporary-verification-session", "local");
    expect(mocks.repo.request).toHaveBeenCalledWith(user.id);
  });
  it("fails closed if revoking the verification session fails", async () => {
    mocks.signOut.mockResolvedValue({ error: { status: 503 } });
    await expect(accountDeletionService.request(user,"password")).rejects.toMatchObject({ code: "REAUTHENTICATION_UNAVAILABLE" });
    expect(mocks.repo.request).not.toHaveBeenCalled();
  });
  it("never propagates a provider exception containing a password", async () => {
    mocks.signIn.mockRejectedValue(new Error("provider echoed sensitive-password"));
    await expect(accountDeletionService.request(user,"sensitive-password")).rejects.toMatchObject({ code: "REAUTHENTICATION_UNAVAILABLE" });
    expect(mocks.repo.request).not.toHaveBeenCalled();
  });
  it("refuses any manifest containing shared course files", async () => {
    mocks.repo.prepare.mockResolvedValue([{ bucket: "academix-course-content", path: "courses/shared.pdf" }]);
    expect(await accountCleanupWorker.run()).toEqual({ completed: 0, failed: 1 });
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.repo.fail).toHaveBeenCalledWith(job,"UNSAFE_STORAGE_MANIFEST");
  });
  it("removes private object bytes through Storage, then hard-deletes credentials", async () => {
    mocks.repo.prepare.mockResolvedValue([{ bucket: "private-files", path: "users/test-user/private.pdf" }]);
    expect(await accountCleanupWorker.run()).toEqual({ completed: 1, failed: 0 });
    expect(mocks.remove).toHaveBeenCalledWith(["users/test-user/private.pdf"]);
    expect(mocks.deleteUser).toHaveBeenCalledWith(user.id,false);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteUser.mock.invocationCallOrder[0]!);
    expect(mocks.repo.finish).toHaveBeenCalledWith(job);
  });
  it("treats already-deleted credentials as an idempotent retry", async () => {
    mocks.deleteUser.mockResolvedValue({ error: { status: 404 } });
    expect(await accountCleanupWorker.run()).toEqual({ completed: 1, failed: 0 });
    expect(mocks.repo.finish).toHaveBeenCalledWith(job);
  });
});
