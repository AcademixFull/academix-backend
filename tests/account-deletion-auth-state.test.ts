import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: { from: mocks.from }, supabaseAuth: { auth: { getUser: mocks.getUser } } }));
import { authService } from "../src/services/auth.service";
beforeEach(() => {
  vi.clearAllMocks(); mocks.from.mockReturnValue({ select: mocks.select }); mocks.select.mockReturnValue({ eq: mocks.eq }); mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user", email: "user@example.test", user_metadata: {} } }, error: null });
});
it("rejects an inactive processing profile despite an otherwise valid JWT", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: { activo: false }, error: null });
  await expect(authService.verifyAccessToken("valid-token")).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
});
it("rejects missing profiles after permanent personal data cleanup", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(authService.verifyAccessToken("valid-token")).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
});
it("fails closed if account state cannot be verified", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "DATABASE_FAILURE" } });
  await expect(authService.verifyAccessToken("valid-token")).rejects.toMatchObject({ code: "PROFILE_LOOKUP_FAILED" });
});
