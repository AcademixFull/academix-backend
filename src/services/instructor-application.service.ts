import { AppError } from "../errors/app-error";
import { administrationRepository } from "../repositories/administration.repository";
import {
  instructorApplicationRepository,
  type InstructorApplicationRepository,
} from "../repositories/instructor-application.repository";
import type {
  ResolveInstructorApplicationInput,
  SubmitInstructorApplicationInput,
} from "../schemas/instructor-application.schemas";
import type { AppRole } from "../types/administration.types";
import { instructorApplicationListQuerySchema, type InstructorApplicationListQuery } from "../schemas/instructor-application.schemas";
import { pageResult } from "../utils/pagination";

export function createInstructorApplicationService(
  repository: InstructorApplicationRepository,
  instructorManager: Pick<typeof administrationRepository, "upsertInstructor" | "findUser"> = administrationRepository
) {
  return {
    getMine(userId: string) {
      return repository.findLatestByUser(userId);
    },

    async submit(userId: string, role: AppRole, input: SubmitInstructorApplicationInput) {
      if (role !== "student") {
        throw new AppError(409, "INSTRUCTOR_APPLICATION_NOT_ALLOWED", "Tu cuenta ya tiene acceso de gestión.");
      }
      const current = await repository.findLatestByUser(userId);
      if (current?.status === "pending") {
        throw new AppError(409, "INSTRUCTOR_APPLICATION_PENDING", "Ya tienes una solicitud pendiente.");
      }
      if (current?.status === "approved") {
        throw new AppError(409, "INSTRUCTOR_APPLICATION_APPROVED", "Tu solicitud ya fue aprobada.");
      }
      return repository.create(userId, input.enrollmentId, input.credentialReference);
    },

    async list(input: InstructorApplicationListQuery = instructorApplicationListQuerySchema.parse({})) {
      const result = await repository.list(input);
      return pageResult(result.records, result.total, input.page, input.limit);
    },

    async resolve(applicationId: string, input: ResolveInstructorApplicationInput, reviewerId: string) {
      const application = await repository.findById(applicationId);
      if (!application) throw new AppError(404, "INSTRUCTOR_APPLICATION_NOT_FOUND", "La solicitud no existe.");
      if (application.status !== "pending") {
        throw new AppError(409, "INSTRUCTOR_APPLICATION_RESOLVED", "La solicitud ya fue atendida.");
      }
      if (input.decision === "approved") {
        const applicant = await instructorManager.findUser(application.userId);
        if (!applicant) {
          throw new AppError(404, "USER_NOT_FOUND", "El usuario solicitante ya no existe.");
        }
        if (applicant.roles.includes("moderator")) {
          throw new AppError(
            422,
            "ROLE_CONFLICT",
            "La solicitud no puede aprobarse mientras la cuenta tenga el rol Moderador."
          );
        }
        await instructorManager.upsertInstructor(
          application.userId,
          input.specialty!,
          input.experienceYears!,
          reviewerId
        );
      }
      return repository.resolve(applicationId, input.decision, input.observations, reviewerId);
    },
  };
}

export const instructorApplicationService = createInstructorApplicationService(instructorApplicationRepository);
