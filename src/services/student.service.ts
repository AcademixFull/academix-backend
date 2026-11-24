import { AppError } from "../errors/app-error";
import {
  catalogRepository,
  type CatalogRepository,
} from "../repositories/catalog.repository";
import {
  studentRepository,
  type StudentEnrollmentRecord,
  type StudentRepository,
} from "../repositories/student.repository";
import { serializeCourseSummary } from "./catalog.service";
import type { EnrollmentSummary, LearningCourse } from "../types/student.types";
import type { AppRole } from "../types/administration.types";
import type { CheckoutInput, CheckoutResult } from "../types/checkout.types";
import type { LibraryListQuery } from "../schemas/student.schemas";
import { organizationService } from "./organization.service";
import { pageResult } from "../utils/pagination";
import { assertCourseLearningAccess, getCourseAccessExpiry } from "./course-access.service";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function percentage(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 10_000) / 100;
}

function isCompleted(enrollment: StudentEnrollmentRecord): boolean {
  return normalized(enrollment.databaseStatus) === "finalizada";
}

function hasLearningAccess(enrollment: StudentEnrollmentRecord): boolean {
  return ["activa", "finalizada"].includes(normalized(enrollment.databaseStatus));
}

export function normalizeByteRange(range: string | undefined, size: number): string | null {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) {
    throw new AppError(416, "INVALID_RANGE", "El rango solicitado no es válido.");
  }

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new AppError(416, "INVALID_RANGE", "El rango solicitado no es válido.");
    }
    const start = Math.max(size - suffixLength, 0);
    return `bytes=${start}-${size - 1}`;
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    throw new AppError(416, "INVALID_RANGE", "El rango solicitado no es válido.");
  }
  return `bytes=${start}-${Math.min(requestedEnd, size - 1)}`;
}

export function createStudentService(
  repository: StudentRepository,
  courses: CatalogRepository
) {
  async function enrollmentSummary(
    enrollment: StudentEnrollmentRecord
  ): Promise<EnrollmentSummary> {
    const records = await courses.listCoursesByIds([enrollment.courseId]);
    const course = records[0] ? serializeCourseSummary(records[0]) : null;
    if (!course) {
      throw new AppError(404, "COURSE_NOT_AVAILABLE", "El curso inscrito ya no está disponible.");
    }
    return {
      id: enrollment.id,
      course,
      status: isCompleted(enrollment) ? "completed" : "in_progress",
      progressPercentage: percentage(
        enrollment.completedLessons,
        enrollment.totalLessons
      ),
      completedLessons: enrollment.completedLessons,
      totalLessons: enrollment.totalLessons,
      lastAccessedAt: enrollment.lastAccessedAt,
    };
  }

  return {
    learningSummary(userId: string) { return repository.learningSummary(userId); },
    courseOwnership(userId: string, courseIds: string[]) { return repository.courseOwnership(userId, courseIds); },
    async checkout(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
      // Price, ownership, authorization and all enrollments are committed in one RPC.
      const receipt = await repository.checkout(userId, input);
      const enrollments = await Promise.all(receipt.items.map((item) => repository.findEnrollment(userId, item.courseId)));
      return {
        ...receipt,
        enrollments: await Promise.all(enrollments.filter((item): item is StudentEnrollmentRecord => Boolean(item && hasLearningAccess(item))).map(enrollmentSummary)),
      };
    },
    async enroll(userId: string, courseId: string): Promise<EnrollmentSummary> {
      const organizationId = await repository.courseOrganizationId(courseId);
      if (
        organizationId &&
        !(await repository.isActiveOrganizationMember(userId, organizationId))
      ) {
        throw new AppError(
          403,
          "ORGANIZATION_MEMBERSHIP_REQUIRED",
          "Este curso está incluido en el plan de una organización y solo sus miembros activos pueden inscribirse."
        );
      }
      const existing = await repository.findEnrollment(userId, courseId);
      if (existing && hasLearningAccess(existing)) {
        await assertCourseLearningAccess(userId, courseId);
        return enrollmentSummary(existing);
      }
      try {
        await repository.enroll(userId, courseId);
      } catch (error) {
        // A concurrent successful enrollment is also a successful retry.
        if (!(error instanceof AppError) || error.code !== "ENROLLMENT_ALREADY_EXISTS") throw error;
        const concurrent = await repository.findEnrollment(userId, courseId);
        if (concurrent && hasLearningAccess(concurrent)) return enrollmentSummary(concurrent);
        throw error;
      }
      const enrollment = await repository.findEnrollment(userId, courseId);
      if (!enrollment) {
        throw new AppError(502, "ENROLLMENT_NOT_AVAILABLE", "No fue posible consultar la inscripción.");
      }
      return enrollmentSummary(enrollment);
    },

    async listMyCoursesPage(userId: string, input: LibraryListQuery) {
      const result = await repository.listEnrollmentPage(userId, input);
      const items = await this.serializeEnrollments(result.records);
      const access = result.records.length ? new Set(await repository.courseOwnership(userId, result.records.map((item) => item.courseId))) : new Set<string>();
      for (const item of items) item.accessActive = access.has(item.course.id);
      return pageResult(items, result.total, input.page, input.limit);
    },

    async listMyCourses(userId: string): Promise<EnrollmentSummary[]> {
      return this.serializeEnrollments(await repository.listEnrollments(userId));
    },

    async serializeEnrollments(enrollments: StudentEnrollmentRecord[]): Promise<EnrollmentSummary[]> {
      if (enrollments.length === 0) return [];
      const records = await courses.listCoursesByIds(
        enrollments.map((enrollment) => enrollment.courseId)
      );
      const courseMap = new Map(
        records
          .map((record) => [record.id, serializeCourseSummary(record)] as const)
          .filter((entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1]))
      );

      return enrollments.flatMap((enrollment) => {
        const course = courseMap.get(enrollment.courseId);
        return course
          ? [
              {
                id: enrollment.id,
                course,
                status: isCompleted(enrollment) ? ("completed" as const) : ("in_progress" as const),
                progressPercentage: percentage(
                  enrollment.completedLessons,
                  enrollment.totalLessons
                ),
                completedLessons: enrollment.completedLessons,
                totalLessons: enrollment.totalLessons,
                lastAccessedAt: enrollment.lastAccessedAt,
              },
            ]
          : [];
      });
    },

    async getLearningCourse(userId: string, courseId: string): Promise<LearningCourse> {
      const enrollment = await repository.findEnrollment(userId, courseId);
      if (!enrollment) {
        throw new AppError(403, "ENROLLMENT_REQUIRED", "Necesitas inscribirte para acceder al aula.");
      }
      if (!hasLearningAccess(enrollment)) {
        throw new AppError(403, "ENROLLMENT_NOT_ACTIVE", "La inscripción todavía no permite acceder al aula.");
      }

      const accessExpiresAt = await getCourseAccessExpiry(userId, courseId);

      const [courseRecord, modules, completedIds] = await Promise.all([
        courses.findCourse(courseId),
        repository.listLearningModules(courseId),
        repository.completedLessonIds(enrollment.id),
      ]);
      if (!courseRecord || !courseRecord.instructor) {
        throw new AppError(404, "COURSE_NOT_AVAILABLE", "El curso ya no está disponible.");
      }
      const completed = new Set(completedIds);
      const totalLessons = modules.reduce((total, module) => total + module.lessons.length, 0);
      const completedLessons = modules.reduce(
        (total, module) =>
          total + module.lessons.filter((lesson) => completed.has(lesson.id)).length,
        0
      );

      return {
        id: courseRecord.id,
        accessExpiresAt,
        title: courseRecord.title,
        instructorName: courseRecord.instructor.fullName,
        progressPercentage: percentage(completedLessons, totalLessons),
        completedLessons,
        totalLessons,
        modules: modules.map((module) => ({
          ...module,
          lessons: module.lessons.map((lesson) => ({
            ...lesson,
            isCompleted: completed.has(lesson.id),
          })),
        })),
      };
    },

    setLessonProgress(
      userId: string,
      lessonId: string,
      completed: boolean
    ): Promise<void> {
      return repository.setLessonProgress(userId, lessonId, completed);
    },

    async getResourceContent(
      userId: string,
      actorRole: AppRole,
      lessonId: string,
      resourceId: string,
      rangeHeader?: string
    ) {
      const file = await repository.findProtectedResource(lessonId, resourceId);
      if (!file) {
        throw new AppError(
          404,
          "RESOURCE_NOT_FOUND",
          "El recurso solicitado no existe o no contiene un archivo."
        );
      }
      let staffAllowed = actorRole === "admin" || actorRole === "moderator";
      if (!staffAllowed) {
        const organizationId = await repository.courseOrganizationId(file.courseId);
        if (organizationId) {
          try {
            await organizationService.canInstructorCreateCourse(organizationId, userId);
            staffAllowed = true;
          } catch (error) {
            if (!(error instanceof AppError) || !["ORGANIZATION_INSTRUCTOR_REQUIRED", "ORGANIZATION_ACCESS_DENIED"].includes(error.code)) throw error;
          }
        } else if (actorRole === "instructor") {
          staffAllowed = await repository.isInstructorAssigned(userId, file.courseId);
        }
      }
      const allowed = staffAllowed || (await repository.hasCourseAccess(userId, file.courseId));
      if (!allowed) {
        throw new AppError(403, "RESOURCE_ACCESS_DENIED", "No tienes acceso a este recurso.");
      }
      if (!staffAllowed) await assertCourseLearningAccess(userId, file.courseId);
      const range = normalizeByteRange(rangeHeader, file.sizeBytes);
      return {
        ...file,
        ...(await repository.openStorageObject(file.storagePath, range)),
      };
    },
  };
}

export const studentService = createStudentService(studentRepository, catalogRepository);
