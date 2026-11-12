import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type {
  CatalogCourseRecord,
  CatalogRepository,
} from "../src/repositories/catalog.repository";
import type {
  StudentEnrollmentRecord,
  StudentRepository,
} from "../src/repositories/student.repository";
import { createStudentService } from "../src/services/student.service";
import { AppError } from "../src/errors/app-error";
import { organizationService } from "../src/services/organization.service";
vi.mock("../src/services/organization.service", () => ({ organizationService: { canInstructorCreateCourse: vi.fn().mockResolvedValue("instructor") } }));
import { getCourseAccessExpiry } from "../src/services/course-access.service";
vi.mock("../src/services/course-access.service", () => ({ assertCourseLearningAccess: vi.fn().mockResolvedValue(undefined), getCourseAccessExpiry: vi.fn().mockResolvedValue(null) }));

const userId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const lessonId = "33333333-3333-4333-8333-333333333333";

const enrollment: StudentEnrollmentRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  courseId,
  databaseStatus: "Activa",
  completedLessons: 1,
  totalLessons: 2,
  lastAccessedAt: "2026-08-11T18:00:00.000Z",
};

const course: CatalogCourseRecord = {
  id: courseId,
  slug: "typescript-practico",
  title: "TypeScript práctico",
  shortDescription: "Aprende TypeScript.",
  description: "Curso completo.",
  objectives: "Aprender",
  requirements: null,
  durationHours: 8,
  price: 0,
  certificateEnabled: true,
  category: { id: 1, name: "Programación", slug: "programacion", description: null },
  categoryId: 1,
  levelName: "Básico",
  language: "Español",
  instructor: { id: userId, fullName: "Ana Pérez", specialty: "Web" },
  modules: [],
};

function studentRepository(overrides: Partial<StudentRepository> = {}): StudentRepository {
  return {
    checkout: vi.fn().mockResolvedValue({ id: "receipt", mode: "simulated", currency: "MXN", total: 125, items: [{ courseId, enrollmentId: enrollment.id, amount: 125, alreadyOwned: false }] }),
    enroll: vi.fn().mockResolvedValue(enrollment.id),
    courseOrganizationId: vi.fn().mockResolvedValue(null),
    isActiveOrganizationMember: vi.fn().mockResolvedValue(false),
    listEnrollments: vi.fn().mockResolvedValue([]),
    listEnrollmentPage: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    courseOwnership: vi.fn().mockResolvedValue([]),
    findEnrollment: vi.fn().mockResolvedValue(enrollment),
    listLearningModules: vi.fn().mockResolvedValue([]),
    completedLessonIds: vi.fn().mockResolvedValue([]),
    setLessonProgress: vi.fn().mockResolvedValue(undefined),
    findProtectedResource: vi.fn().mockResolvedValue(null),
    hasCourseAccess: vi.fn().mockResolvedValue(false),
    isInstructorAssigned: vi.fn().mockResolvedValue(false),
    openStorageObject: vi.fn().mockResolvedValue({
      stream: Readable.from("contenido"),
      status: 200,
      contentLength: "9",
      contentRange: null,
    }),
    ...overrides,
  };
}

function catalogRepository(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    listCategories: vi.fn().mockResolvedValue([]),
    listCourses: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    listFeaturedCourses: vi.fn().mockResolvedValue([]),
    listCoursesByIds: vi.fn().mockResolvedValue([course]),
    findCourse: vi.fn().mockResolvedValue(course),
    listRelatedCourses: vi.fn().mockResolvedValue([]),
    findInstructor: vi.fn().mockResolvedValue(null),
    listInstructorCourses: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("servicio del estudiante", () => {
  it("conserva el progreso y evita repetir la inscripción de un curso completado", async () => {
    const repository = studentRepository({ findEnrollment: vi.fn().mockResolvedValue({ ...enrollment, databaseStatus: "Finalizada", completedLessons: 2 }) });
    const result = await createStudentService(repository, catalogRepository()).enroll(userId, courseId);
    expect(result.status).toBe("completed");
    expect(repository.enroll).not.toHaveBeenCalled();
  });

  it("devuelve la confirmación del servidor y su biblioteca sin confiar en precios del cliente", async () => {
    const repository = studentRepository({ listEnrollments: vi.fn().mockResolvedValue([enrollment]) });
    const result = await createStudentService(repository, catalogRepository()).checkout(userId, {
      courseIds: [courseId], idempotencyKey: "66666666-6666-4666-8666-666666666666",
    });
    expect(result).toMatchObject({ mode: "simulated", total: 125, enrollments: [{ id: enrollment.id, course: { id: courseId } }] });
  });

  it("crea una inscripción con el contrato exacto del frontend", async () => {
    const repository = studentRepository({ findEnrollment: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(enrollment) });
    const service = createStudentService(repository, catalogRepository());

    const result = await service.enroll(userId, courseId);

    expect(repository.enroll).toHaveBeenCalledWith(userId, courseId);
    expect(result).toMatchObject({
      id: enrollment.id,
      course: { id: courseId, title: course.title },
      status: "in_progress",
      progressPercentage: 50,
      completedLessons: 1,
      totalLessons: 2,
    });
  });

  it("reserva los cursos institucionales para miembros activos de la organización", async () => {
    const organizationId = "55555555-5555-4555-8555-555555555555";
    const repository = studentRepository({
      courseOrganizationId: vi.fn().mockResolvedValue(organizationId),
      isActiveOrganizationMember: vi.fn().mockResolvedValue(false),
    });
    const service = createStudentService(repository, catalogRepository());

    await expect(service.enroll(userId, courseId)).rejects.toMatchObject({
      status: 403,
      code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
    });
    expect(repository.enroll).not.toHaveBeenCalled();
  });

  it("permite al miembro activo inscribirse sin pago en el curso institucional", async () => {
    const organizationId = "55555555-5555-4555-8555-555555555555";
    const repository = studentRepository({
      courseOrganizationId: vi.fn().mockResolvedValue(organizationId),
      isActiveOrganizationMember: vi.fn().mockResolvedValue(true),
      findEnrollment: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(enrollment),
    });
    const service = createStudentService(repository, catalogRepository());

    await expect(service.enroll(userId, courseId)).resolves.toMatchObject({ id: enrollment.id });
    expect(repository.enroll).toHaveBeenCalledWith(userId, courseId);
  });

  it("devuelve la biblioteca sin consultas de catálogo N+1", async () => {
    const courses = catalogRepository();
    const service = createStudentService(
      studentRepository({ listEnrollments: vi.fn().mockResolvedValue([enrollment]) }),
      courses
    );

    const result = await service.listMyCourses(userId);

    expect(result).toHaveLength(1);
    expect(courses.listCoursesByIds).toHaveBeenCalledOnce();
    expect(courses.listCoursesByIds).toHaveBeenCalledWith([courseId]);
  });

  it("bloquea el aula sin inscripción", async () => {
    const service = createStudentService(
      studentRepository({ findEnrollment: vi.fn().mockResolvedValue(null) }),
      catalogRepository()
    );

    await expect(service.getLearningCourse(userId, courseId)).rejects.toMatchObject({
      status: 403,
      code: "ENROLLMENT_REQUIRED",
    });
  });

  it("bloquea una inscripción pendiente", async () => {
    const service = createStudentService(
      studentRepository({
        findEnrollment: vi.fn().mockResolvedValue({
          ...enrollment,
          databaseStatus: "Pendiente",
        }),
      }),
      catalogRepository()
    );

    await expect(service.getLearningCourse(userId, courseId)).rejects.toMatchObject({
      status: 403,
      code: "ENROLLMENT_NOT_ACTIVE",
    });
  });

  it("arma el aula y marca las lecciones completadas", async () => {
    const service = createStudentService(
      studentRepository({
        listLearningModules: vi.fn().mockResolvedValue([
          {
            id: "module-1",
            title: "Fundamentos",
            position: 1,
            lessons: [
              {
                id: lessonId,
                title: "Tipos",
                description: "Introducción",
                content: "Contenido de tipos",
                durationMinutes: 10,
                isPreview: false,
                resources: [],
              },
            ],
          },
        ]),
        completedLessonIds: vi.fn().mockResolvedValue([lessonId]),
      }),
      catalogRepository()
    );

    const result = await service.getLearningCourse(userId, courseId);

    expect(result.progressPercentage).toBe(100);
    expect(result.modules[0]?.lessons[0]?.isCompleted).toBe(true);
  });

  it("delega la actualización atómica del progreso", async () => {
    const repository = studentRepository();
    const service = createStudentService(repository, catalogRepository());

    await service.setLessonProgress(userId, lessonId, true);

    expect(repository.setLessonProgress).toHaveBeenCalledWith(userId, lessonId, true);
  });

  it("bloquea la descarga de un archivo sin inscripción", async () => {
    const service = createStudentService(
      studentRepository({
        findProtectedResource: vi.fn().mockResolvedValue({
          courseId,
          storagePath: "courses/file.pdf",
          originalName: "guia.pdf",
          mimeType: "application/pdf",
          sizeBytes: 9,
        }),
      }),
      catalogRepository()
    );

    await expect(
      service.getResourceContent(userId, "student", lessonId, "55555555-5555-4555-8555-555555555555")
    ).rejects.toMatchObject({ status: 403, code: "RESOURCE_ACCESS_DENIED" });
  });

  it("descarga mediante el backend cuando la inscripción está activa", async () => {
    const repository = studentRepository({
      findProtectedResource: vi.fn().mockResolvedValue({
        courseId,
        storagePath: "courses/file.pdf",
        originalName: "guia.pdf",
        mimeType: "application/pdf",
        sizeBytes: 9,
      }),
      hasCourseAccess: vi.fn().mockResolvedValue(true),
    });
    const service = createStudentService(repository, catalogRepository());

    const result = await service.getResourceContent(
      userId,
      "student",
      lessonId,
      "55555555-5555-4555-8555-555555555555"
    );

    expect(result.status).toBe(200);
    expect(repository.openStorageObject).toHaveBeenCalledWith("courses/file.pdf", null);
  });

  it("normaliza el rango para reproducir solo una parte del recurso", async () => {
    const repository = studentRepository({
      findProtectedResource: vi.fn().mockResolvedValue({
        courseId,
        storagePath: "courses/video.mp4",
        originalName: "video.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1_000,
      }),
      hasCourseAccess: vi.fn().mockResolvedValue(true),
      openStorageObject: vi.fn().mockResolvedValue({
        stream: Readable.from("fragmento"),
        status: 206,
        contentLength: "100",
        contentRange: "bytes 100-199/1000",
      }),
    });
    const service = createStudentService(repository, catalogRepository());

    const result = await service.getResourceContent(
      userId,
      "student",
      lessonId,
      "55555555-5555-4555-8555-555555555555",
      "bytes=100-199"
    );

    expect(result.status).toBe(206);
    expect(repository.openStorageObject).toHaveBeenCalledWith(
      "courses/video.mp4",
      "bytes=100-199"
    );
  });

  it("rechaza rangos múltiples o fuera del tamaño del archivo", async () => {
    const repository = studentRepository({
      findProtectedResource: vi.fn().mockResolvedValue({
        courseId,
        storagePath: "courses/video.mp4",
        originalName: "video.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1_000,
      }),
      hasCourseAccess: vi.fn().mockResolvedValue(true),
    });
    const service = createStudentService(repository, catalogRepository());

    await expect(
      service.getResourceContent(
        userId,
        "student",
        lessonId,
        "55555555-5555-4555-8555-555555555555",
        "bytes=1000-1200"
      )
    ).rejects.toMatchObject({ status: 416, code: "INVALID_RANGE" });
    expect(repository.openStorageObject).not.toHaveBeenCalled();
  });
});


it("revalidates subscription access before returning lesson content", async () => {
  const repository = studentRepository();
  vi.mocked(getCourseAccessExpiry).mockRejectedValueOnce(new Error("Expired subscription"));
  await expect(createStudentService(repository, catalogRepository()).getLearningCourse(userId, courseId)).rejects.toThrow("Expired subscription");
  expect(repository.listLearningModules).not.toHaveBeenCalled();
});


it("does not let an assigned instructor bypass an expired institutional plan for files", async () => {
  const repository = studentRepository({ courseOrganizationId: vi.fn().mockResolvedValue("institution"), isInstructorAssigned: vi.fn().mockResolvedValue(true),
    findProtectedResource: vi.fn().mockResolvedValue({ courseId, storagePath: "courses/file.pdf", originalName: "file.pdf", mimeType: "application/pdf", sizeBytes: 100 }) });
  vi.mocked(organizationService.canInstructorCreateCourse).mockRejectedValueOnce(new AppError(403, "ORGANIZATION_SUBSCRIPTION_REQUIRED", "Plan vencido"));
  await expect(createStudentService(repository, catalogRepository()).getResourceContent(userId, "instructor", lessonId, "file-id")).rejects.toMatchObject({ code: "ORGANIZATION_SUBSCRIPTION_REQUIRED" });
  expect(repository.openStorageObject).not.toHaveBeenCalled();
});
