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
vi.mock("../src/services/administration.service", () => ({
  administrationService: {
    listUsers: vi.fn(),
    setUserRoles: vi.fn(),
    listInstructors: vi.fn(),
    upsertInstructor: vi.fn(),
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    courseOptions: vi.fn(),
    listCourses: vi.fn(),
    createCourse: vi.fn(),
    createCourseForInstructor: vi.fn(),
    updateCourse: vi.fn(),
    assignPrincipalInstructor: vi.fn(),
    publishCourse: vi.fn(),
    archiveCourse: vi.fn(),
    restoreCourse: vi.fn(),
    submitCourse: vi.fn(),
  },
}));

import { createApp } from "../src/app";
import { administrationService } from "../src/services/administration.service";
import { authService } from "../src/services/auth.service";

const app = createApp();
const id = "22222222-2222-4222-8222-222222222222";
const admin = { id, fullName: "Admin", email: "admin@example.com", role: "admin" as const };
const instructor = { ...admin, role: "instructor" as const };

describe("rutas administrativas e instructor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige autenticación para administración", async () => {
    const response = await request(app).get("/api/v1/admin/users");
    expect(response.status).toBe(401);
  });

  it("rechaza a un instructor en rutas de administrador", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(instructor);
    const response = await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROLE_FORBIDDEN");
  });

  it("lista usuarios para un administrador", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(admin);
    vi.mocked(administrationService.listUsers).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });
    const response = await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(0);
  });

  it("lista categorías activas e inactivas para poder reactivarlas", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(admin);
    vi.mocked(administrationService.listCategories).mockResolvedValue({ items: [
      { id: 1, name: "Programación", slug: "programacion", description: "", active: false },
    ], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    const response = await request(app)
      .get("/api/v1/admin/categories")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.data[0].active).toBe(false);
  });

  it("valida roles duplicados antes del servicio", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(admin);
    const response = await request(app)
      .patch(`/api/v1/admin/users/${id}/roles`)
      .set("Authorization", "Bearer token")
      .send({ roles: ["admin", "admin"] });
    expect(response.status).toBe(422);
    expect(administrationService.setUserRoles).not.toHaveBeenCalled();
  });

  it("permite al instructor listar solo su área de trabajo", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(instructor);
    vi.mocked(administrationService.listCourses).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });
    const response = await request(app)
      .get("/api/v1/instructor/courses")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(administrationService.listCourses).toHaveBeenCalledWith(
      { page: 1, limit: 20 },
      instructor.id
    );
  });
});
