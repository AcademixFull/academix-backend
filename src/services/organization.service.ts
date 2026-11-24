import { organizationMemberListQuerySchema, organizationCourseListQuerySchema, type OrganizationMemberListQuery, type OrganizationCourseListQuery } from "../schemas/organization.schemas";
import { pageResult } from "../utils/pagination";
import { AppError } from "../errors/app-error";
import {
  organizationRepository,
  organizationRoleNames,
  type OrganizationRepository,
} from "../repositories/organization.repository";
import type {
  CreateOrganizationInput,
  UpdateOrganizationMemberInput,
} from "../schemas/organization.schemas";
import { createSlug } from "../utils/slug";

function validSlug(explicit: string | undefined, name: string): string {
  const slug = explicit ?? createSlug(name);
  if (!slug) throw new AppError(422, "INVALID_SLUG", "No fue posible generar un slug válido.");
  return slug;
}

export function createOrganizationService(repository: OrganizationRepository) {
  async function requireMember(organizationId: string, userId: string) {
    const membership = await repository.findMembership(organizationId, userId);
    if (!membership) {
      throw new AppError(403, "ORGANIZATION_ACCESS_DENIED", "No perteneces a esta organización.");
    }
    return membership;
  }

  async function requireAdministrator(organizationId: string, userId: string) {
    const membership = await requireMember(organizationId, userId);
    if (organizationRoleNames.roleFromDatabase(membership.rol) !== "administrator") {
      throw new AppError(403, "ORGANIZATION_ADMIN_REQUIRED", "Se requiere administrar esta organización.");
    }
    return membership;
  }

  return {
    async remove(organizationId: string, userId: string) {
      // The locked database operation owns the complete permission check and replay.
      await repository.remove(organizationId, userId);
      return { deleted: true };
    },
    listForUser(userId: string) {
      return repository.listForUser(userId);
    },

    async create(input: CreateOrganizationInput, userId: string) {
      const id = await repository.create({ ...input, slug: validSlug(input.slug, input.name) }, userId);
      const organization = (await repository.listForUser(userId)).find((item) => item.id === id);
      if (!organization) throw new AppError(502, "ORGANIZATION_NOT_AVAILABLE", "No fue posible consultar la organización recién creada.");
      return organization;
    },

    async join(userId: string, joinCode: string, studentNumber: string) {
      const id = await repository.join(userId, joinCode, studentNumber);
      const organization = (await repository.listForUser(userId)).find((item) => item.id === id);
      if (!organization) throw new AppError(502, "ORGANIZATION_NOT_AVAILABLE", "No fue posible consultar la organización.");
      return organization;
    },

    async detail(organizationId: string, userId: string) {
      await requireMember(organizationId, userId);
      const organization = (await repository.listForUser(userId)).find((item) => item.id === organizationId);
      if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "La organización no existe.");
      return organization;
    },

    async listMembers(organizationId: string, userId: string, input: OrganizationMemberListQuery = organizationMemberListQuerySchema.parse({})) {
      await requireAdministrator(organizationId, userId);
      const result = await repository.listMembers(organizationId, input);
      return pageResult(result.records, result.total, input.page, input.limit);
    },

    async setMemberRole(
      organizationId: string,
      targetUserId: string,
      input: UpdateOrganizationMemberInput,
      actorId: string
    ) {
      await requireAdministrator(organizationId, actorId);
      const target = await requireMember(organizationId, targetUserId);
      const currentRole = organizationRoleNames.roleFromDatabase(target.rol);
      if (currentRole === "administrator" && input.role !== "administrator") {
        const administrators = await repository.countAdministrators(organizationId);
        if (administrators <= 1) {
          throw new AppError(409, "LAST_ORGANIZATION_ADMIN", "La organización debe conservar al menos un administrador.");
        }
      }
      await repository.setMemberRole(organizationId, targetUserId, input.role, actorId);
      return (await repository.listMembers(organizationId, { page: 1, limit: 1, userId: targetUserId })).records[0] ?? null;
    },

    async listCourses(organizationId: string, userId: string, input: OrganizationCourseListQuery = organizationCourseListQuerySchema.parse({})) {
      await requireMember(organizationId, userId);
      const result = await repository.listCourses(organizationId, input);
      return pageResult(result.records, result.total, input.page, input.limit);
    },

    async assignInstructor(organizationId: string, courseId: string, instructorId: string, actorId: string) {
      await requireAdministrator(organizationId, actorId);
      await repository.assertPaid(organizationId);
      const target = await requireMember(organizationId, instructorId);
      if (!["administrator", "instructor"].includes(organizationRoleNames.roleFromDatabase(target.rol))) {
        throw new AppError(403, "ORGANIZATION_INSTRUCTOR_REQUIRED", "Selecciona un instructor de esta institución.");
      }
      await repository.assignInstructor(organizationId, courseId, instructorId, actorId);
    },

    async canInstructorCreateCourse(organizationId: string, userId: string) {
      const membership = await requireMember(organizationId, userId);
      const role = organizationRoleNames.roleFromDatabase(membership.rol);
      if (role !== "administrator" && role !== "instructor") {
        throw new AppError(403, "ORGANIZATION_INSTRUCTOR_REQUIRED", "Tu rol en la organización no permite crear cursos.");
      }
      await repository.assertPaid(organizationId);
      return role;
    },
  };
}

export const organizationService = createOrganizationService(organizationRepository);
