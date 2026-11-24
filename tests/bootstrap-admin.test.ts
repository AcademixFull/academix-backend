import { describe, expect, it, vi } from "vitest";
import {
  createBootstrapAdminService,
  type BootstrapAdminRepository,
} from "../src/services/bootstrap-admin.service";

describe("bootstrap del primer administrador", () => {
  it("normaliza el correo y delega la operación atómica", async () => {
    const repository: BootstrapAdminRepository = {
      bootstrap: vi.fn().mockResolvedValue({ userId: "user-id", email: "admin@example.com" }),
    };
    const service = createBootstrapAdminService(repository);
    await service.bootstrap(" ADMIN@EXAMPLE.COM ");
    expect(repository.bootstrap).toHaveBeenCalledWith("admin@example.com");
  });

  it("rechaza un correo inválido antes de consultar Supabase", async () => {
    const repository: BootstrapAdminRepository = { bootstrap: vi.fn() };
    const service = createBootstrapAdminService(repository);
    expect(() => service.bootstrap("no-es-correo")).toThrow();
    expect(repository.bootstrap).not.toHaveBeenCalled();
  });
});
