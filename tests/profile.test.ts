import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/auth.service", () => ({
  authService: {
    verifyAccessToken: vi.fn(),
  },
}));

vi.mock("../src/services/profile.service", () => ({
  profileService: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

import { createApp } from "../src/app";
import { authService } from "../src/services/auth.service";
import { profileService } from "../src/services/profile.service";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ana Pérez",
  email: "ana@example.com",
  role: "student" as const,
};

const profile = {
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  phone: "2461234567",
  country: "México",
  bio: "Estudiante de Academix.",
};

describe("perfil protegido", () => {
  const app = createApp();

  beforeEach(() => vi.clearAllMocks());

  it("bloquea la consulta sin token", async () => {
    const response = await request(app).get("/api/v1/users/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("devuelve el perfil del JWT verificado", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);
    vi.mocked(profileService.get).mockResolvedValue(profile);

    const response = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(profile);
    expect(profileService.get).toHaveBeenCalledWith(user);
  });

  it("actualiza únicamente los campos permitidos", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);
    vi.mocked(profileService.update).mockResolvedValue({ ...profile, country: "México" });

    const response = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", "Bearer valid.jwt.token")
      .send({ country: "México" });

    expect(response.status).toBe(200);
    expect(profileService.update).toHaveBeenCalledWith(user, { country: "México" });
  });

  it("rechaza una actualización vacía", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);

    const response = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", "Bearer valid.jwt.token")
      .send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(profileService.update).not.toHaveBeenCalled();
  });
});
