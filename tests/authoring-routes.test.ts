import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/auth.service", () => ({
  authService: {
    verifyAccessToken: vi.fn(), signUp: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), requestPasswordReset: vi.fn(),
  },
}));

vi.mock("../src/services/authoring.service", () => ({
  authoringService: {
    resourceOptions: vi.fn(), getContent: vi.fn(), createModule: vi.fn(), updateModule: vi.fn(),
    createLesson: vi.fn(), updateLesson: vi.fn(), createResource: vi.fn(), updateResource: vi.fn(), uploadFile: vi.fn(),
  },
}));

import { createApp } from "../src/app";
import { authService } from "../src/services/auth.service";
import { authoringService } from "../src/services/authoring.service";

const app = createApp();
const courseId = "22222222-2222-4222-8222-222222222222";
const moduleId = "33333333-3333-4333-8333-333333333333";
const admin = { id: "11111111-1111-4111-8111-111111111111", fullName: "Admin", email: "admin@example.com", role: "admin" as const };
const student = { ...admin, role: "student" as const };

describe("rutas de autoría", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige autenticación", async () => {
    expect((await request(app).get(`/api/v1/authoring/courses/${courseId}/content`)).status).toBe(401);
  });

  it("deja pasar al alumno autenticado para que el servicio valide si es instructor institucional", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(student);
    vi.mocked(authoringService.getContent).mockResolvedValue({ courseId, status: "draft", modules: [] } as never);
    const response = await request(app)
      .get(`/api/v1/authoring/courses/${courseId}/content`)
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(authoringService.getContent).toHaveBeenCalledWith(courseId, student.id, "student");
  });

  it("crea un módulo validado", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(admin);
    vi.mocked(authoringService.createModule).mockResolvedValue({ id: moduleId } as never);
    const response = await request(app)
      .post(`/api/v1/authoring/courses/${courseId}/modules`)
      .set("Authorization", "Bearer token")
      .send({ title: "Fundamentos", position: 1 });
    expect(response.status).toBe(201);
    expect(authoringService.createModule).toHaveBeenCalledWith(
      courseId,
      { title: "Fundamentos", description: "", position: 1 },
      admin.id,
      "admin"
    );
  });

  it("valida la posición del módulo", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(admin);
    const response = await request(app)
      .post(`/api/v1/authoring/courses/${courseId}/modules`)
      .set("Authorization", "Bearer token")
      .send({ title: "Fundamentos", position: 0 });
    expect(response.status).toBe(422);
    expect(authoringService.createModule).not.toHaveBeenCalled();
  });

  it("recibe un archivo binario solo mediante Express", async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(admin);
    vi.mocked(authoringService.uploadFile).mockResolvedValue({ id: "file-id" } as never);
    const response = await request(app)
      .post(`/api/v1/authoring/courses/${courseId}/files`)
      .set("Authorization", "Bearer token")
      .set("Content-Type", "application/pdf")
      .set("x-file-name", "guia.pdf")
      .send(Buffer.from("PDF"));
    expect(response.status).toBe(201);
    expect(authoringService.uploadFile).toHaveBeenCalledWith(
      courseId,
      expect.any(Buffer),
      "guia.pdf",
      "application/pdf",
      admin.id,
      "admin"
    );
  });
});
