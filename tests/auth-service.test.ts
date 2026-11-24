import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminSignOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUserById: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("../src/config/env", () => ({
  env: {
    PASSWORD_RESET_REDIRECT_URL:
      "http://localhost:5173/CursosWeb/",
  },
  emailConfirmationRedirectUrl: "http://localhost:5173/CursosWeb/",
}));

vi.mock("../src/config/supabase", () => ({
  supabaseAuth: {
    auth: {
      signUp: mocks.signUp,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  },
  supabaseAdmin: {
    auth: {
      admin: {
        signOut: mocks.adminSignOut,
        updateUserById: mocks.updateUserById,
      },
    },
  },
}));

import { authService } from "../src/services/auth.service";

describe("servicio de autenticación administrativa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminSignOut.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.updateUserById.mockResolvedValue({ error: null });
  });

  it("revoca la sesión mediante el cliente secreto", async () => {
    await authService.signOut("access-token");
    expect(mocks.adminSignOut).toHaveBeenCalledWith("access-token", "local");
  });

  it("envía la URL autorizada de recuperación", async () => {
    await authService.requestPasswordReset("ana@example.com");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", {
      redirectTo:
        "http://localhost:5173/CursosWeb/",
    });
  });

  it("actualiza la contraseña y revoca todas las sesiones", async () => {
    await authService.updatePassword("user-id", "recovery-token", {
      password: "nueva-contraseña-segura",
    });
    expect(mocks.updateUserById).toHaveBeenCalledWith("user-id", {
      password: "nueva-contraseña-segura",
    });
    expect(mocks.adminSignOut).toHaveBeenCalledWith("recovery-token", "global");
    expect(mocks.adminSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateUserById.mock.invocationCallOrder[0]
    );
  });
});
