import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/auth.service", () => ({
  authService: {
    verifyAccessToken: vi.fn(),
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
  },
}));

vi.mock("../src/services/moderation.service", () => ({
  moderationService: {
    listCourses: vi.fn(),
    getCourse: vi.fn(),
    takeDown: vi.fn(),
    restore: vi.fn(),
  },
}));

import { createApp } from "../src/app";
import { authService } from "../src/services/auth.service";
import { moderationService } from "../src/services/moderation.service";

const app = createApp();
const courseId = "22222222-2222-4222-8222-222222222222";
const baseUser = {
  id: "33333333-3333-4333-8333-333333333333",
  fullName: "Usuario",
  email: "usuario@example.com",
};

const moderator = { ...baseUser, role: "moderator" as const };
const admin = { ...baseUser, role: "admin" as const };
const instructor = { ...baseUser, role: "instructor" as const };

function auth(user: typeof moderator | typeof admin | typeof instructor) {
  vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);
}

describe("rutas de moderación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite a un moderador listar cursos para revisión", async () => {
    auth(moderator);
    vi.mocked(moderationService.listCourses).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });
    const response = await request(app)
      .get("/api/v1/moderation/courses")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
  });

  it("rechaza a un instructor sin rol de moderador", async () => {
    auth(instructor);
    const response = await request(app)
      .get("/api/v1/moderation/courses")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROLE_FORBIDDEN");
  });

  it("permite al moderador dar de baja con motivo", async () => {
    auth(moderator);
    vi.mocked(moderationService.takeDown).mockResolvedValue({} as never);
    const response = await request(app)
      .post(`/api/v1/moderation/courses/${courseId}/takedown`)
      .set("Authorization", "Bearer token")
      .send({ reason: "Contenido inapropiado confirmado durante la revisión." });
    expect(response.status).toBe(200);
    expect(moderationService.takeDown).toHaveBeenCalledWith(
      courseId,
      "Contenido inapropiado confirmado durante la revisión.",
      moderator.id
    );
  });

  it("permite restaurar a un moderador o administrador", async () => {
    vi.mocked(moderationService.restore).mockResolvedValue({} as never);

    auth(moderator);
    const moderatorResponse = await request(app)
      .post(`/api/v1/moderation/courses/${courseId}/restore`)
      .set("Authorization", "Bearer token");
    expect(moderatorResponse.status).toBe(200);
    expect(moderationService.restore).toHaveBeenCalledWith(courseId, moderator.id);

    auth(admin);
    const adminResponse = await request(app)
      .post(`/api/v1/moderation/courses/${courseId}/restore`)
      .set("Authorization", "Bearer token");
    expect(adminResponse.status).toBe(200);
    expect(moderationService.restore).toHaveBeenCalledWith(courseId, admin.id);
  });
});
