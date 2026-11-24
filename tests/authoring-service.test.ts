import { describe, expect, it, vi } from "vitest";
import type { AuthoringRepository } from "../src/repositories/authoring.repository";
import { createAuthoringService } from "../src/services/authoring.service";

const actorId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const moduleId = "33333333-3333-4333-8333-333333333333";

function repository(overrides: Partial<AuthoringRepository> = {}): AuthoringRepository {
  return {
    courseAccess: vi.fn().mockResolvedValue({ courseId, organizationId: null, status: "draft", assigned: true }),
    moduleCourseId: vi.fn().mockResolvedValue(courseId),
    lessonCourseId: vi.fn().mockResolvedValue(courseId),
    resourceCourseId: vi.fn().mockResolvedValue(courseId),
    resourceOptions: vi.fn().mockResolvedValue([]),
    fileTypeId: vi.fn().mockResolvedValue(1),
    listContent: vi.fn().mockResolvedValue({ courseId, status: "draft", modules: [] }),
    createModule: vi.fn().mockResolvedValue({
      id: moduleId,
      title: "Fundamentos",
      description: "",
      position: 1,
      active: true,
      lessons: [],
    }),
    updateModule: vi.fn().mockResolvedValue(null),
    createLesson: vi.fn(),
    updateLesson: vi.fn().mockResolvedValue(null),
    createResource: vi.fn(),
    updateResource: vi.fn().mockResolvedValue(null),
    createFile: vi.fn(),
    ...overrides,
  };
}

describe("servicio de autoría de contenido", () => {
  it("permite crear módulos en un borrador asignado", async () => {
    const repo = repository();
    const service = createAuthoringService(repo);
    const result = await service.createModule(
      courseId,
      { title: "Fundamentos", description: "", position: 1 },
      actorId,
      "instructor"
    );
    expect(result.id).toBe(moduleId);
    expect(repo.createModule).toHaveBeenCalledWith(courseId, expect.any(Object), actorId);
  });

  it("impide que un instructor edite un curso no asignado", async () => {
    const service = createAuthoringService(
      repository({
        courseAccess: vi.fn().mockResolvedValue({ courseId, organizationId: null, status: "draft", assigned: false }),
      })
    );
    await expect(
      service.getContent(courseId, actorId, "instructor")
    ).rejects.toMatchObject({ status: 403, code: "COURSE_NOT_ASSIGNED" });
  });

  it("permite editar contenido publicado al instructor asignado", async () => {
    const repo = repository({
      courseAccess: vi.fn().mockResolvedValue({ courseId, organizationId: null, status: "published", assigned: true }),
      listContent: vi.fn().mockResolvedValue({ courseId, status: "published", modules: [] }),
    });
    const service = createAuthoringService(repo);
    await expect(service.getContent(courseId, actorId, "instructor")).resolves.toMatchObject({ status: "published" });
  });

  it("permite corregir contenido de un curso dado de baja por moderación", async () => {
    const repo = repository({
      courseAccess: vi.fn().mockResolvedValue({ courseId, organizationId: null, status: "moderated", assigned: true }),
      listContent: vi.fn().mockResolvedValue({ courseId, status: "moderated", modules: [] }),
    });
    const service = createAuthoringService(repo);
    await expect(service.getContent(courseId, actorId, "instructor")).resolves.toMatchObject({ status: "moderated" });
  });

  it("bloquea la edición mientras el curso está en revisión", async () => {
    const service = createAuthoringService(repository({ courseAccess: vi.fn().mockResolvedValue({ courseId, organizationId: null, status: "review", assigned: true }) }));
    await expect(service.getContent(courseId, actorId, "instructor")).rejects.toMatchObject({ code: "COURSE_UNDER_REVIEW" });
  });

  it("rechaza archivos vacíos antes de llamar a Storage", async () => {
    const service = createAuthoringService(repository());
    await expect(
      service.uploadFile(courseId, Buffer.alloc(0), "guia.pdf", "application/pdf", actorId, "admin")
    ).rejects.toMatchObject({ status: 422, code: "EMPTY_FILE" });
  });

  it("rechaza tipos de archivo fuera de la lista permitida", async () => {
    const service = createAuthoringService(repository());
    await expect(
      service.uploadFile(courseId, Buffer.from("exe"), "programa.exe", "application/x-msdownload", actorId, "admin")
    ).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_FILE_TYPE" });
  });
  it("mantiene al moderador en modo solo lectura fuera del panel de moderación", async () => {
    const repo = repository();
    const service = createAuthoringService(repo);
    await expect(
      service.createModule(
        courseId,
        { title: "No debe editar", description: "", position: 2 },
        actorId,
        "moderator"
      )
    ).rejects.toMatchObject({ status: 403, code: "MODERATOR_READ_ONLY" });
    expect(repo.createModule).not.toHaveBeenCalled();
  });

});
