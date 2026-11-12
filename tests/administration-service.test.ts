import { describe, expect, it, vi } from "vitest";
import type { AdministrationRepository } from "../src/repositories/administration.repository";
import { createAdministrationService } from "../src/services/administration.service";
import type { ManagedCourse } from "../src/types/administration.types";

const course: ManagedCourse = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "curso-prueba",
  title: "Curso de prueba",
  shortDescription: "Descripción corta",
  description: "Descripción completa",
  learningOutcomes: ["Aprender"],
  requirements: [],
  targetAudience: "Estudiantes",
  categoryId: 1,
  level: "beginner",
  modality: "self_paced",
  language: "es",
  durationHours: 8,
  price: 49,
  certificateEnabled: true,
  requiresApproval: false,
  status: "draft",
  active: true,
  instructor: { id: "11111111-1111-4111-8111-111111111111", name: "Ana Pérez" },
  publishedAt: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

function repository(overrides: Partial<AdministrationRepository> = {}): AdministrationRepository {
  return {
    listUsers: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    setUserRoles: vi.fn().mockResolvedValue(undefined),
    setUserActive: vi.fn().mockResolvedValue(null),
    hasAnotherActiveAdmin: vi.fn().mockResolvedValue(true),
    findUser: vi.fn().mockResolvedValue(null),
    listInstructors: vi.fn().mockResolvedValue([]),
    upsertInstructor: vi.fn().mockResolvedValue(undefined),
    findInstructor: vi.fn().mockResolvedValue(null),
    listCategories: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn(),
    updateCategory: vi.fn().mockResolvedValue(null),
    courseOptions: vi.fn(),
    listCourses: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    findCourse: vi.fn().mockResolvedValue(course),
    createCourse: vi.fn().mockResolvedValue(course),
    updateCourse: vi.fn().mockResolvedValue(course),
    assignPrincipalInstructor: vi.fn().mockResolvedValue(undefined),
    assignCourseCreator: vi.fn().mockResolvedValue(undefined),
    isInstructorAssigned: vi.fn().mockResolvedValue(true),
    courseContentStats: vi.fn().mockResolvedValue({ modules: 1, lessons: 1 }),
    transitionCourse: vi.fn().mockResolvedValue({ ...course, status: "review" }),
    ...overrides,
  };
}

describe("servicio administrativo", () => {
  it("lets only a platform administrator change featured visibility", async () => {
    const repo = repository();
    const service = createAdministrationService(repo);
    await expect(service.updateCourse(course.id, { featuredVisible: false }, "instructor-id", "instructor"))
      .rejects.toMatchObject({ status: 403, code: "FEATURED_ADMIN_REQUIRED" });
    expect(repo.updateCourse).not.toHaveBeenCalled();
    await service.updateCourse(course.id, { featuredVisible: false }, "admin-id", "admin");
    expect(repo.updateCourse).toHaveBeenCalledWith(course.id, { featuredVisible: false }, "admin-id");
  });
  it("impide combinar los roles Instructor y Moderador", async () => {
    const repo = repository();
    const service = createAdministrationService(repo);

    await expect(
      service.setUserRoles(
        "33333333-3333-4333-8333-333333333333",
        { roles: ["instructor", "moderator"] },
        "admin-id"
      )
    ).rejects.toMatchObject({ status: 422, code: "ROLE_CONFLICT" });
    expect(repo.setUserRoles).not.toHaveBeenCalled();
  });

  it("impide habilitar perfil de instructor a una cuenta Moderador", async () => {
    const repo = repository({
      findUser: vi.fn().mockResolvedValue({
        id: "33333333-3333-4333-8333-333333333333",
        fullName: "Moderador prueba",
        email: "moderador@example.com",
        active: true,
        roles: ["moderator"],
      }),
    });
    const service = createAdministrationService(repo);

    await expect(
      service.upsertInstructor(
        "33333333-3333-4333-8333-333333333333",
        { specialty: "Programación", experienceYears: 4 },
        "admin-id"
      )
    ).rejects.toMatchObject({ status: 422, code: "ROLE_CONFLICT" });
    expect(repo.upsertInstructor).not.toHaveBeenCalled();
  });

  it("genera un slug estable al crear un curso", async () => {
    const repo = repository();
    const service = createAdministrationService(repo);
    await service.createCourse(
      {
        title: "Introducción a TypeScript",
        shortDescription: "",
        description: "",
        learningOutcomes: [],
        requirements: [],
        targetAudience: "",
        categoryId: 1,
        level: "beginner",
        modality: "self_paced",
        language: "es",
        durationHours: null,
        price: 0,
        certificateEnabled: true,
        requiresApproval: false,
      },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(repo.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "introduccion-a-typescript" }),
      expect.any(String)
    );
  });

  it("crea el borrador del instructor y lo asigna automáticamente", async () => {
    const repo = repository({ findCourse: vi.fn().mockResolvedValue(course) });
    const service = createAdministrationService(repo);
    await service.createCourseForInstructor(
      {
        title: "Curso propio",
        shortDescription: "",
        description: "",
        learningOutcomes: [],
        requirements: [],
        targetAudience: "Estudiantes",
        categoryId: 1,
        level: "beginner",
        modality: "self_paced",
        language: "es",
        durationHours: null,
        price: 49,
        certificateEnabled: true,
        requiresApproval: false,
      },
      course.instructor!.id,
      "instructor"
    );
    expect(repo.assignCourseCreator).toHaveBeenCalledWith(course.id, course.instructor!.id);
  });

  it("impide que un instructor edite un curso ajeno", async () => {
    const service = createAdministrationService(
      repository({ isInstructorAssigned: vi.fn().mockResolvedValue(false) })
    );
    await expect(
      service.updateCourse(course.id, { title: "Cambio" }, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "instructor")
    ).rejects.toMatchObject({ status: 403, code: "COURSE_NOT_ASSIGNED" });
  });

  it("permite enviar a revisión solo el borrador asignado", async () => {
    const repo = repository();
    const service = createAdministrationService(repo);
    const result = await service.submitCourse(
      course.id,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "instructor"
    );
    expect(result.status).toBe("review");
    expect(repo.transitionCourse).toHaveBeenCalledWith(course.id, "draft", "review", expect.any(String));
  });

  it("rechaza publicar un curso incompleto", async () => {
    const service = createAdministrationService(
      repository({ findCourse: vi.fn().mockResolvedValue({ ...course, status: "review", instructor: null }) })
    );
    await expect(service.publishCourse(course.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toMatchObject({
      status: 422,
      code: "COURSE_NOT_READY",
    });
  });

  it("detecta una transición concurrente", async () => {
    const service = createAdministrationService(
      repository({
        findCourse: vi.fn().mockResolvedValue({ ...course, status: "review" }),
        transitionCourse: vi.fn().mockResolvedValue(null),
      })
    );
    await expect(service.publishCourse(course.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toMatchObject({
      status: 409,
      code: "COURSE_STATE_CHANGED",
    });
  });

  it("restaura un curso archivado como borrador activo", async () => {
    const archived = { ...course, status: "archived" as const, active: false };
    const repo = repository({
      findCourse: vi.fn().mockResolvedValue(archived),
      transitionCourse: vi.fn().mockResolvedValue({ ...course, status: "draft", active: true }),
    });
    const result = await createAdministrationService(repo).restoreCourse(course.id, "admin-id");
    expect(result.status).toBe("draft");
    expect(repo.transitionCourse).toHaveBeenCalledWith(course.id, "archived", "draft", "admin-id");
  });

  it("permite al instructor editar un curso ya publicado", async () => {
    const published = { ...course, status: "published" as const, price: 49 };
    const repo = repository({ findCourse: vi.fn().mockResolvedValue(published), updateCourse: vi.fn().mockResolvedValue(published) });
    const result = await createAdministrationService(repo).updateCourse(course.id, { shortDescription: "Contenido actualizado" }, course.instructor!.id, "instructor");
    expect(result.status).toBe("published");
    expect(repo.updateCourse).toHaveBeenCalled();
  });

  it("permite corregir el precio de un curso dado de baja por moderación sin restaurarlo automáticamente", async () => {
    const moderated = { ...course, status: "moderated" as const, active: false, price: 0 };
    const corrected = { ...moderated, price: 79 };
    const repo = repository({
      findCourse: vi.fn().mockResolvedValue(moderated),
      updateCourse: vi.fn().mockResolvedValue(corrected),
    });

    const result = await createAdministrationService(repo).updateCourse(
      course.id,
      { price: 79 },
      course.instructor!.id,
      "instructor"
    );

    expect(result.status).toBe("moderated");
    expect(result.price).toBe(79);
    expect(repo.updateCourse).toHaveBeenCalledWith(course.id, { price: 79 }, course.instructor!.id);
    expect(repo.transitionCourse).not.toHaveBeenCalled();
  });

  it("mantiene bloqueado el envío a revisión mientras el curso siga dado de baja por moderación", async () => {
    const moderated = { ...course, status: "moderated" as const, active: false };
    const repo = repository({ findCourse: vi.fn().mockResolvedValue(moderated) });

    await expect(
      createAdministrationService(repo).submitCourse(course.id, course.instructor!.id, "instructor")
    ).rejects.toMatchObject({ status: 409, code: "COURSE_MODERATED" });
    expect(repo.transitionCourse).not.toHaveBeenCalled();
  });

  it("envía a revisión un curso publicado cuando su instructor cambia el precio", async () => {
    const published = { ...course, status: "published" as const, price: 49 };
    const withNewPrice = { ...published, price: 79 };
    const review = { ...withNewPrice, status: "review" as const };
    const repo = repository({
      findCourse: vi.fn().mockResolvedValue(published),
      updateCourse: vi.fn().mockResolvedValue(withNewPrice),
      transitionCourse: vi.fn().mockResolvedValue(review),
    });
    const result = await createAdministrationService(repo).updateCourse(
      course.id,
      { price: 79 },
      course.instructor!.id,
      "instructor"
    );
    expect(result.status).toBe("review");
    expect(repo.transitionCourse).toHaveBeenCalledWith(course.id, "published", "review", course.instructor!.id);
  });

  it("permite a Academix ajustar el precio independiente sin sacar de publicación", async () => {
    const published = { ...course, status: "published" as const, price: 1200 };
    const adjusted = { ...published, price: 199 };
    const repo = repository({
      findCourse: vi.fn().mockResolvedValue(published),
      updateCourse: vi.fn().mockResolvedValue(adjusted),
    });
    const result = await createAdministrationService(repo).updateCourse(course.id, { price: 199 }, "admin-id", "admin");
    expect(result.status).toBe("published");
    expect(repo.transitionCourse).not.toHaveBeenCalled();
  });

  it("mantiene los cursos institucionales sin precio individual", async () => {
    const institutional = {
      ...course,
      price: 0,
      organization: { id: "55555555-5555-4555-8555-555555555555", name: "Universidad" },
    };
    const service = createAdministrationService(repository({ findCourse: vi.fn().mockResolvedValue(institutional) }));
    await expect(service.updateCourse(course.id, { price: 20 }, "admin-id", "admin")).rejects.toMatchObject({
      status: 403,
      code: "INSTITUTIONAL_COURSE_INCLUDED",
    });
  });

  it("publica un curso institucional incluido aunque su precio individual sea cero", async () => {
    const institutionalReview = {
      ...course,
      price: 0,
      status: "review" as const,
      organization: { id: "55555555-5555-4555-8555-555555555555", name: "Universidad" },
    };
    const published = { ...institutionalReview, status: "published" as const };
    const repo = repository({
      findCourse: vi.fn().mockResolvedValue(institutionalReview),
      transitionCourse: vi.fn().mockResolvedValue(published),
    });
    const notifier = { coursePublished: vi.fn().mockResolvedValue(undefined) };
    await expect(createAdministrationService(repo, notifier).publishCourse(course.id, "admin-id")).resolves.toMatchObject({ status: "published" });
    expect(notifier.coursePublished).toHaveBeenCalledWith(course.id, course.title);
  });

  it("permite desactivar un usuario normal y protege al último administrador", async () => {
    const student = { id: "33333333-3333-4333-8333-333333333333", fullName: "Alumno", email: "a@example.com", active: true, roles: ["student" as const] };
    const repo = repository({ findUser: vi.fn().mockResolvedValue(student), setUserActive: vi.fn().mockResolvedValue({ ...student, active: false }) });
    const service = createAdministrationService(repo);
    await expect(service.setUserActive(student.id, false, "admin-id")).resolves.toMatchObject({ active: false });

    const admin = { ...student, id: "44444444-4444-4444-8444-444444444444", roles: ["admin" as const] };
    const guarded = createAdministrationService(repository({ findUser: vi.fn().mockResolvedValue(admin), hasAnotherActiveAdmin: vi.fn().mockResolvedValue(false) }));
    await expect(guarded.setUserActive(admin.id, false, "other-admin")).rejects.toMatchObject({ code: "LAST_ADMIN_REQUIRED" });
  });

  it("permite asignar el rol global de moderador sin convertirlo en administrador", async () => {
    const moderatorUser = {
      id: "77777777-7777-4777-8777-777777777777",
      fullName: "Moderador",
      email: "moderador@example.com",
      active: true,
      roles: ["moderator" as const],
    };
    const repo = repository({ findUser: vi.fn().mockResolvedValue(moderatorUser) });
    const result = await createAdministrationService(repo).setUserRoles(
      moderatorUser.id,
      { roles: ["student", "moderator"] },
      "admin-id"
    );
    expect(repo.setUserRoles).toHaveBeenCalledWith(
      moderatorUser.id,
      ["Alumno", "Moderador"],
      "admin-id"
    );
    expect(result.roles).toContain("moderator");
  });

  it("impide que un moderador cambie contenido o precio desde administración", async () => {
    const repo = repository({ findCourse: vi.fn().mockResolvedValue({ ...course, status: "published" }) });
    await expect(
      createAdministrationService(repo).updateCourse(
        course.id,
        { price: 5 },
        "moderator-id",
        "moderator"
      )
    ).rejects.toMatchObject({ status: 403, code: "MODERATOR_READ_ONLY" });
    expect(repo.updateCourse).not.toHaveBeenCalled();
  });

});


describe("institutional administrator with a global student account", () => {
  const org = { id: "44444444-4444-4444-8444-444444444444", name: "Campus" };
  const scopedAccess = { canInstructorCreateCourse: vi.fn().mockResolvedValue("administrator") };
  it("edits an own institutional course even when another instructor owns it", async () => {
    const repo = repository({ findCourse: vi.fn().mockResolvedValue({ ...course, organization: org }), isInstructorAssigned: vi.fn().mockResolvedValue(false) });
    const service = createAdministrationService(repo, undefined, scopedAccess);
    await expect(service.updateCourse(course.id, { title: "New title" }, "institution-admin", "student")).resolves.toBeTruthy();
    expect(scopedAccess.canInstructorCreateCourse).toHaveBeenCalledWith(org.id, "institution-admin");
    expect(repo.setUserRoles).not.toHaveBeenCalled();
  });
  it("denies a foreign institution and an independent course", async () => {
    const scoped = { canInstructorCreateCourse: vi.fn().mockRejectedValue({ status: 403, code: "ORGANIZATION_ACCESS_DENIED" }) };
    const repo = repository({ findCourse: vi.fn().mockResolvedValue({ ...course, organization: org }) });
    const service = createAdministrationService(repo, undefined, scoped);
    await expect(service.updateCourse(course.id, { title: "New title" }, "institution-admin", "student")).rejects.toMatchObject({ status: 403 });
    vi.mocked(repo.findCourse).mockResolvedValue({ ...course, organization: null });
    await expect(service.updateCourse(course.id, { title: "New title" }, "institution-admin", "student")).rejects.toMatchObject({ code: "EXTERNAL_INSTRUCTOR_APPROVAL_REQUIRED" });
    expect(repo.updateCourse).not.toHaveBeenCalled();
  });
});
