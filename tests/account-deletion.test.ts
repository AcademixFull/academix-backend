import { describe, expect, it, vi } from "vitest";
import { createAccountDeletionService, createAccountCleanupWorker } from "../src/services/account-deletion.service";

const user = { id: "u1", email: "ana@example.test" };
const request = { id: "r1", userId: "u1", requestedAt: "2026-01-01T00:00:00Z", deleteAfter: "2026-01-11T00:00:00Z", status: "pending" as const };
function repository() {
  return { get: vi.fn().mockResolvedValue(request), request: vi.fn().mockResolvedValue(request), cancel: vi.fn(), claim: vi.fn().mockResolvedValue([]), prepare: vi.fn(), finish: vi.fn(), fail: vi.fn() };
}
describe("account deletion", () => {
  it("rejects reauthentication as a different identity before persisting", async () => {
    const repo = repository();
    const service = createAccountDeletionService(repo, vi.fn().mockResolvedValue("u2"));
    await expect(service.request(user, "password")).rejects.toMatchObject({ code: "REAUTHENTICATION_FAILED" });
    expect(repo.request).not.toHaveBeenCalled();
  });
  it("uses verified identity and the exact persisted deadline", async () => {
    const repo = repository();
    const verify = vi.fn().mockResolvedValue(user.id);
    expect(await createAccountDeletionService(repo, verify).request(user, "password")).toEqual(request);
    expect(repo.request).toHaveBeenCalledWith(user.id);
    expect(verify).toHaveBeenCalledWith(user.email, "password");
  });
  it("does not delete credentials when SQL cleanup fails closed", async () => {
    const repo = repository();
    const job = { ...request, leaseToken: "lease1" };
    repo.claim.mockResolvedValue([job]); repo.prepare.mockRejectedValue(new Error("unknown FK"));
    const privacy = { removePrivateFiles: vi.fn(), deleteAuth: vi.fn() };
    expect(await createAccountCleanupWorker(repo, privacy).run()).toEqual({ completed: 0, failed: 1 });
    expect(privacy.deleteAuth).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(job, "CLEANUP_FAILED");
  });
  it("cleans only SQL manifest paths then credentials and completes under its lease", async () => {
    const repo = repository(); const job = { ...request, leaseToken: "lease1" };
    repo.claim.mockResolvedValue([job]); repo.prepare.mockResolvedValue([]);
    const privacy = { removePrivateFiles: vi.fn(), deleteAuth: vi.fn() };
    expect(await createAccountCleanupWorker(repo, privacy).run()).toEqual({ completed: 1, failed: 0 });
    expect(privacy.removePrivateFiles).toHaveBeenCalledWith([]);
    expect(privacy.deleteAuth).toHaveBeenCalledWith("u1");
    expect(repo.finish).toHaveBeenCalledWith(job);
  });
});
