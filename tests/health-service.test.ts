import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkSupabaseReadiness } from "../src/services/health.service";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../src/config/supabase", () => ({
  supabaseAdmin: { from: mocks.from },
}));

describe("health service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({ error: null });
  });

  it("consulta la clave primaria real de roles", async () => {
    await checkSupabaseReadiness();

    expect(mocks.from).toHaveBeenCalledWith("roles");
    expect(mocks.select).toHaveBeenCalledWith("id_rol");
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });

  it("falla cuando PostgREST devuelve un error", async () => {
    mocks.limit.mockResolvedValue({ error: { message: "database unavailable" } });

    await expect(checkSupabaseReadiness()).rejects.toThrow("Database readiness check failed");
  });
});
