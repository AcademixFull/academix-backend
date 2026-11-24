import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/auth.service", () => ({
  authService: {
    signUp: vi.fn(),
    signIn: vi.fn(),
    verifyAccessToken: vi.fn(),
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

import { createApp } from "../src/app";
import { AppError } from "../src/errors/app-error";
import { authService } from "../src/services/auth.service";

const app = createApp();
const user = {
  id: "b5be8e73-8c5f-4f31-b081-b19a23e7fd7d",
  fullName: "Ana López",
  email: "ana@example.com",
  role: "student" as const,
};
const session = {
  user,
  accessToken: "valid.jwt.token",
  expiresAt: "2026-08-11T20:00:00.000Z",
};

describe("Auth y rutas protegidas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registra con el contrato que consume el frontend", async () => {
    vi.mocked(authService.signUp).mockResolvedValue(session);

    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "Ana López",
      email: "ANA@EXAMPLE.COM",
      password: "contraseña-segura",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ success: true, data: session });
    expect(authService.signUp).toHaveBeenCalledWith({
      fullName: "Ana López",
      email: "ana@example.com",
      password: "contraseña-segura",
    });
  });

  it("rechaza un registro inválido antes de llamar a Supabase", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "",
      email: "correo-invalido",
      password: "123",
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(authService.signUp).not.toHaveBeenCalled();
  });

  it("inicia sesión y devuelve AuthSession", async () => {
    vi.mocked(authService.signIn).mockResolvedValue(session);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "ana@example.com",
      password: "contraseña-segura",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBe("valid.jwt.token");
    expect(response.body.data.user.role).toBe("student");
  });

  it("bloquea una ruta protegida sin bearer token", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("bloquea un bearer token inválido", async () => {
    vi.mocked(authService.verifyAccessToken).mockRejectedValue(
      new AppError(401, "INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.")
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("permite acceder con un JWT verificado", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { user } });
    expect(authService.verifyAccessToken).toHaveBeenCalledWith("valid.jwt.token");
  });

  it("revoca la sesión actual al cerrar sesión", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);
    vi.mocked(authService.signOut).mockResolvedValue(undefined);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(response.status).toBe(204);
    expect(authService.signOut).toHaveBeenCalledWith("valid.jwt.token");
  });

  it("solicita recuperación sin revelar si el correo existe", async () => {
    vi.mocked(authService.requestPasswordReset).mockResolvedValue(undefined);

    const response = await request(app)
      .post("/api/v1/auth/password-reset")
      .send({ email: "ana@example.com" });

    expect(response.status).toBe(204);
  });

  it("actualiza la contraseña del usuario verificado", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);
    vi.mocked(authService.updatePassword).mockResolvedValue(undefined);

    const response = await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", "Bearer recovery.jwt.token")
      .send({ password: "nueva-contraseña-segura" });

    expect(response.status).toBe(204);
    expect(authService.updatePassword).toHaveBeenCalledWith(
      user.id,
      "recovery.jwt.token",
      { password: "nueva-contraseña-segura" }
    );
  });

  it("rechaza una contraseña nueva demasiado corta", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);

    const response = await request(app)
      .patch("/api/v1/auth/password")
      .set("Authorization", "Bearer recovery.jwt.token")
      .send({ password: "corta" });

    expect(response.status).toBe(422);
    expect(authService.updatePassword).not.toHaveBeenCalled();
  });
});
