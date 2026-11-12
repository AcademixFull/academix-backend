import { listQuerySchema, type ListQuery } from "../schemas/pagination.schemas";
import { AppError } from "../errors/app-error";
import {
  administrationRepository,
  databaseRoleNames,
  type AdministrationRepository,
} from "../repositories/administration.repository";
import type {
  CreateCategoryInput,
  CreateCourseInput,
  ManagedCourseListQuery,
  SetUserRolesInput,
  UpdateCategoryInput,
  UpdateCourseInput,
  UpsertInstructorInput,
  UserListQuery,
} from "../schemas/administration.schemas";
import type { AppRole, ManagedCourse } from "../types/administration.types";
import { createSlug } from "../utils/slug";
import { organizationService } from "./organization.service";
import { notificationService } from "./notification.service";

function pagination<T>(records: T[], total: number, page: number, limit: number) {
  return {
    items: records,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

function requireCourse(course: ManagedCourse | null): ManagedCourse {
  if (!course) throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
  return course;
}

function validSlug(explicitSlug: string | undefined, title: string): string {
  const slug = explicitSlug ?? createSlug(title);
  if (!slug) throw new AppError(422, "INVALID_SLUG", "No fue posible generar un slug válido.");
  return slug;
}

function ensureExclusiveOperationalRoles(roles: AppRole[]): void {
  if (roles.includes("instructor") && roles.includes("moderator")) {
    throw new AppError(
      422,
      "ROLE_CONFLICT",
      "Instructor y Moderador son roles exclusivos. Retira uno antes de guardar los permisos."
    );
  }
}

type CoursePublicationNotifier = Pick<typeof notificationService, "coursePublished">;

export function createAdministrationService(
  repository: AdministrationRepository,
  notifier: CoursePublicationNotifier = notificationService,
  scopedOrganizations: Pick<typeof organizationService, "canInstructorCreateCourse"> = organizationService
) {
  async function editableCourse(
    courseId: string,
    actorId: string,
    actorRole: AppRole,
    options: { allowModerated?: boolean } = {}
  ) {
    if (actorRole === "moderator") {
      throw new AppError(403, "MODERATOR_READ_ONLY", "El rol Moderador no puede editar cursos ni precios.");
    }
    const course = requireCourse(await repository.findCourse(courseId));
    if (course.status === "archived") {
      throw new AppError(409, "COURSE_ARCHIVED", "Un curso archivado no se puede modificar.");
    }
    if (course.status === "moderated" && !options.allowModerated) {
      throw new AppError(
        409,
        "COURSE_MODERATED",
        "El curso está dado de baja por moderación. Corrige los datos o el contenido indicado; un Moderador o Administrador podrá restaurarlo cuando vuelva a cumplir."
      );
    }
    if (actorRole !== "admin") {
      let institutionalAdministrator = false;
      if (course.organization) {
        institutionalAdministrator = await scopedOrganizations.canInstructorCreateCourse(course.organization.id, actorId) === "administrator";
      } else if (actorRole !== "instructor") {
        throw new AppError(
          403,
          "EXTERNAL_INSTRUCTOR_APPROVAL_REQUIRED",
          "Para gestionar cursos independientes primero debes ser aprobado como instructor de Academix."
        );
      }
      if (!institutionalAdministrator && !(await repository.isInstructorAssigned(courseId, actorId))) {
        throw new AppError(403, "COURSE_NOT_ASSIGNED", "Solo puedes modificar cursos asignados.");
      }
      if (course.status === "review") {
        throw new AppError(409, "COURSE_UNDER_REVIEW", "El curso está siendo revisado por Academix.");
      }
      const editableStatus =
        course.status === "draft" ||
        course.status === "published" ||
        (course.status === "moderated" && options.allowModerated);
      if (!editableStatus) {
        throw new AppError(409, "COURSE_NOT_EDITABLE", "Este curso no se puede editar en su estado actual.");
      }
    }
    return course;
  }

  return {
    async listUsers(input: UserListQuery) {
      const result = await repository.listUsers(input);
      return pagination(result.records, result.total, input.page, input.limit);
    },

    async setUserRoles(userId: string, input: SetUserRolesInput, actorId: string) {
      ensureExclusiveOperationalRoles(input.roles);
      await repository.setUserRoles(
        userId,
        input.roles.map((role) => databaseRoleNames[role]),
        actorId
      );
      const user = await repository.findUser(userId);
      if (!user) throw new AppError(404, "USER_NOT_FOUND", "El usuario solicitado no existe.");
      return user;
    },

    async setUserActive(userId: string, active: boolean, actorId: string) {
      if (!active && userId === actorId) {
        throw new AppError(409, "CANNOT_DEACTIVATE_SELF", "No puedes desactivar tu propia cuenta administrativa.");
      }
      const current = await repository.findUser(userId);
      if (!current) throw new AppError(404, "USER_NOT_FOUND", "El usuario solicitado no existe.");
      if (!active && current.roles.includes("admin") && !(await repository.hasAnotherActiveAdmin(userId))) {
        throw new AppError(409, "LAST_ADMIN_REQUIRED", "Academix debe conservar al menos un administrador activo.");
      }
      const updated = await repository.setUserActive(userId, active, actorId);
      if (!updated) throw new AppError(404, "USER_NOT_FOUND", "El usuario solicitado no existe.");
      return updated;
    },

    async listInstructors(input: ListQuery = listQuerySchema.parse({})) {
      const result = await repository.listInstructors(input);
      return pagination(result.records, result.total, input.page, input.limit);
    },

    async upsertInstructor(userId: string, input: UpsertInstructorInput, actorId: string) {
      const current = await repository.findUser(userId);
      if (!current) throw new AppError(404, "USER_NOT_FOUND", "El usuario solicitado no existe.");
      if (current.roles.includes("moderator")) {
        throw new AppError(
          422,
          "ROLE_CONFLICT",
          "Una cuenta Moderador no puede habilitarse también como Instructor. Cambia primero su rol global."
        );
      }
      await repository.upsertInstructor(userId, input.specialty, input.experienceYears, actorId);
      const instructor = await repository.findInstructor(userId);
      if (!instructor) {
        throw new AppError(502, "INSTRUCTOR_NOT_AVAILABLE", "No fue posible consultar al instructor.");
      }
      return instructor;
    },

    async createCategory(input: CreateCategoryInput, actorId: string) {
      return repository.createCategory(
        { ...input, slug: validSlug(input.slug, input.name) },
        actorId
      );
    },

    async listCategories(input: ListQuery = listQuerySchema.parse({})) {
      const result = await repository.listCategories(input);
      return pagination(result.records, result.total, input.page, input.limit);
    },

    async updateCategory(categoryId: number, input: UpdateCategoryInput, actorId: string) {
      const category = await repository.updateCategory(categoryId, input, actorId);
      if (!category) {
        throw new AppError(404, "CATEGORY_NOT_FOUND", "La categoría solicitada no existe.");
      }
      return category;
    },

    courseOptions() {
      return repository.courseOptions();
    },

    async listCourses(input: ManagedCourseListQuery, instructorId?: string) {
      const result = await repository.listCourses(input, instructorId);
      return pagination(result.records, result.total, input.page, input.limit);
    },

    async createCourse(input: CreateCourseInput, actorId: string) {
      return repository.createCourse(
        { ...input, slug: validSlug(input.slug, input.title) },
        actorId
      );
    },

    async createCourseForInstructor(input: CreateCourseInput, instructorId: string, actorRole: AppRole) {
      if (input.featuredVisible !== undefined && actorRole !== "admin") throw new AppError(403, "FEATURED_ADMIN_REQUIRED", "Solo un administrador de Academix puede modificar los destacados.");
      if (actorRole === "moderator") {
        throw new AppError(403, "MODERATOR_READ_ONLY", "El rol Moderador no puede crear cursos desde sus permisos de moderación.");
      }
      if (input.organizationId) {
        await scopedOrganizations.canInstructorCreateCourse(input.organizationId, instructorId);
      } else if (actorRole !== "instructor") {
        throw new AppError(
          403,
          "EXTERNAL_INSTRUCTOR_APPROVAL_REQUIRED",
          "Para crear cursos independientes primero debes ser aprobado como instructor de Academix."
        );
      } else if (input.price <= 0) {
        throw new AppError(422, "COURSE_PRICE_REQUIRED", "Un curso independiente debe tener un precio mayor a cero.");
      }
      const created = await repository.createCourse(
        {
          ...input,
          price: input.organizationId ? 0 : input.price,
          slug: validSlug(input.slug, input.title),
        },
        instructorId
      );
      try {
        await repository.assignCourseCreator(created.id, instructorId);
      } catch (error) {
        await repository.transitionCourse(created.id, "draft", "archived", instructorId).catch(() => null);
        throw error;
      }
      return requireCourse(await repository.findCourse(created.id));
    },

    async updateCourse(
      courseId: string,
      input: UpdateCourseInput,
      actorId: string,
      actorRole: AppRole
    ) {
      if (input.featuredVisible !== undefined && actorRole !== "admin") throw new AppError(403, "FEATURED_ADMIN_REQUIRED", "Solo un administrador de Academix puede modificar los destacados.");
      const current = await editableCourse(courseId, actorId, actorRole, { allowModerated: true });
      const priceChanged = input.price !== undefined && input.price !== current.price;
      if (current.status === "published" && input.slug && input.slug !== current.slug) {
        throw new AppError(409, "PUBLISHED_SLUG_IMMUTABLE", "El slug publicado no se puede cambiar.");
      }
      if (current.organization && priceChanged) {
        throw new AppError(
          403,
          "INSTITUTIONAL_COURSE_INCLUDED",
          "Los cursos institucionales están incluidos en el plan de la organización y no tienen precio individual."
        );
      }
      if (!current.organization && input.price !== undefined && input.price <= 0) {
        throw new AppError(422, "COURSE_PRICE_REQUIRED", "Un curso independiente debe tener un precio mayor a cero.");
      }
      const updated = requireCourse(await repository.updateCourse(courseId, input, actorId));
      if (actorRole !== "admin" && !current.organization && current.status === "published" && priceChanged) {
        const review = await repository.transitionCourse(courseId, "published", "review", actorId);
        if (!review) {
          throw new AppError(409, "COURSE_STATE_CHANGED", "El curso cambió de estado mientras se enviaba el nuevo precio a revisión.");
        }
        return review;
      }
      return updated;
    },

    async assignPrincipalInstructor(courseId: string, instructorId: string, actorId: string) {
      const course = requireCourse(await repository.findCourse(courseId));
      if (course.status === "archived") {
        throw new AppError(409, "COURSE_ARCHIVED", "No puedes asignar un curso archivado.");
      }
      await repository.assignPrincipalInstructor(courseId, instructorId, actorId);
      return requireCourse(await repository.findCourse(courseId));
    },

    async submitCourse(courseId: string, actorId: string, actorRole: AppRole) {
      const course = await editableCourse(courseId, actorId, actorRole);
      if (course.status !== "draft") {
        throw new AppError(409, "INVALID_COURSE_TRANSITION", "Solo un borrador puede enviarse a revisión.");
      }
      const updated = await repository.transitionCourse(courseId, "draft", "review", actorId);
      if (!updated) throw new AppError(409, "COURSE_STATE_CHANGED", "El curso cambió de estado.");
      return updated;
    },

    async publishCourse(courseId: string, actorId: string) {
      const course = requireCourse(await repository.findCourse(courseId));
      if (course.status !== "review") {
        throw new AppError(409, "INVALID_COURSE_TRANSITION", "Solo un curso en revisión puede publicarse.");
      }
      if (
        !course.instructor ||
        !course.shortDescription ||
        !course.description ||
        course.learningOutcomes.length === 0
      ) {
        throw new AppError(
          422,
          "COURSE_NOT_READY",
          "El curso requiere instructor, descripciones y objetivos antes de publicarse."
        );
      }
      if (!course.organization && course.price <= 0) {
        throw new AppError(422, "COURSE_PRICE_REQUIRED", "El curso necesita un precio externo mayor a cero antes de publicarse.");
      }
      const content = await repository.courseContentStats(courseId);
      if (content.modules === 0 || content.lessons === 0) {
        throw new AppError(
          422,
          "COURSE_CONTENT_REQUIRED",
          "El curso requiere al menos un módulo y una lección activos antes de publicarse."
        );
      }
      const updated = await repository.transitionCourse(courseId, "review", "published", actorId);
      if (!updated) throw new AppError(409, "COURSE_STATE_CHANGED", "El curso cambió de estado.");
      await notifier.coursePublished(courseId, updated.title).catch(() => undefined);
      return updated;
    },

    async archiveOwnCourse(courseId: string, actorId: string, actorRole: AppRole) {
      if (actorRole === "moderator") {
        throw new AppError(403, "MODERATOR_READ_ONLY", "El rol Moderador no puede editar ni archivar cursos desde el área de autoría.");
      }
      const course = requireCourse(await repository.findCourse(courseId));
      if (actorRole !== "admin") {
        let institutionalAdministrator = false;
        if (course.organization) {
          institutionalAdministrator = await scopedOrganizations.canInstructorCreateCourse(course.organization.id, actorId) === "administrator";
        } else if (actorRole !== "instructor") {
          throw new AppError(403, "EXTERNAL_INSTRUCTOR_APPROVAL_REQUIRED", "No tienes acceso a este curso independiente.");
        }
        if (!institutionalAdministrator && !(await repository.isInstructorAssigned(courseId, actorId))) {
          throw new AppError(403, "COURSE_NOT_ASSIGNED", "Solo puedes dar de baja cursos asignados a ti.");
        }
      }
      if (course.status === "moderated") {
        throw new AppError(409, "COURSE_MODERATED", "El curso está dado de baja por moderación. Un Moderador o Administrador puede restaurarlo desde el flujo de moderación cuando vuelva a cumplir los lineamientos.");
      }
      if (course.status === "archived") {
        throw new AppError(409, "INVALID_COURSE_TRANSITION", "El curso ya está dado de baja.");
      }
      const updated = await repository.transitionCourse(courseId, course.status, "archived", actorId);
      if (!updated) throw new AppError(409, "COURSE_STATE_CHANGED", "El curso cambió de estado.");
      return updated;
    },

    async archiveCourse(courseId: string, actorId: string) {
      const course = requireCourse(await repository.findCourse(courseId));
      if (course.status === "moderated") {
        throw new AppError(409, "COURSE_MODERATED", "El curso está dado de baja por moderación. Debes restaurarlo desde el flujo de moderación antes de archivarlo.");
      }
      if (course.status === "archived") {
        throw new AppError(409, "INVALID_COURSE_TRANSITION", "El curso ya está archivado.");
      }
      const updated = await repository.transitionCourse(courseId, course.status, "archived", actorId);
      if (!updated) throw new AppError(409, "COURSE_STATE_CHANGED", "El curso cambió de estado.");
      return updated;
    },

    async restoreCourse(courseId: string, actorId: string) {
      const course = requireCourse(await repository.findCourse(courseId));
      if (course.status !== "archived") {
        throw new AppError(409, "COURSE_NOT_ARCHIVED", "Solo puedes restaurar un curso archivado.");
      }
      const updated = await repository.transitionCourse(courseId, "archived", "draft", actorId);
      if (!updated) throw new AppError(409, "COURSE_STATE_CHANGED", "El curso cambió de estado.");
      return updated;
    },
  };
}

export const administrationService = createAdministrationService(administrationRepository);
