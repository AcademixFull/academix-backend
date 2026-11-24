import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import {
  authoringRepository,
  type AuthoringRepository,
} from "../repositories/authoring.repository";
import type {
  CreateLessonInput,
  CreateModuleInput,
  CreateResourceInput,
  UpdateLessonInput,
  UpdateModuleInput,
  UpdateResourceInput,
} from "../schemas/authoring.schemas";
import type { AppRole } from "../types/administration.types";
import { organizationService } from "./organization.service";

export const COURSE_CONTENT_BUCKET = "academix-course-content";
export const MAX_COURSE_FILE_BYTES = 25 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/ogg", "audio/wav",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

function safeName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").at(-1)?.trim() ?? "";
  const cleaned = base.replace(/[^\p{Letter}\p{Number}._ -]/gu, "_").replace(/\s+/g, " ");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new AppError(422, "INVALID_FILE_NAME", "El nombre del archivo no es válido.");
  }
  return cleaned.slice(0, 180);
}

function requireEntity<T>(value: T | null, code: string, message: string): T {
  if (!value) throw new AppError(404, code, message);
  return value;
}

export function createAuthoringService(repository: AuthoringRepository, scopedOrganizations: Pick<typeof organizationService, "canInstructorCreateCourse"> = organizationService) {
  async function assertEditable(courseId: string, actorId: string, actorRole: AppRole) {
    if (actorRole === "moderator") {
      throw new AppError(403, "MODERATOR_READ_ONLY", "El rol Moderador solo puede revisar contenido desde el panel de moderación.");
    }
    const access = requireEntity(
      await repository.courseAccess(courseId, actorId),
      "COURSE_NOT_FOUND",
      "El curso solicitado no existe."
    );
    if (access.status === "archived") {
      throw new AppError(409, "COURSE_CONTENT_IMMUTABLE", "Un curso dado de baja no se puede modificar.");
    }
    let institutionalAdministrator = false;
    if (actorRole !== "admin") {
      if (access.organizationId) {
        institutionalAdministrator = await scopedOrganizations.canInstructorCreateCourse(access.organizationId, actorId) === "administrator";
      } else if (actorRole !== "instructor") {
        throw new AppError(
          403,
          "EXTERNAL_INSTRUCTOR_APPROVAL_REQUIRED",
          "Para editar cursos independientes primero debes ser aprobado como instructor de Academix."
        );
      }
    }
    if (actorRole !== "admin" && !institutionalAdministrator && !access.assigned) {
      throw new AppError(403, "COURSE_NOT_ASSIGNED", "Solo puedes modificar cursos asignados.");
    }
    if (actorRole !== "admin" && access.status === "review") {
      throw new AppError(409, "COURSE_UNDER_REVIEW", "El contenido no se puede modificar mientras Academix revisa el curso.");
    }
    return access;
  }

  async function courseForModule(moduleId: string): Promise<string> {
    return requireEntity(await repository.moduleCourseId(moduleId), "MODULE_NOT_FOUND", "El módulo solicitado no existe.");
  }

  async function courseForLesson(lessonId: string): Promise<string> {
    return requireEntity(await repository.lessonCourseId(lessonId), "LESSON_NOT_FOUND", "La lección solicitada no existe.");
  }

  async function courseForResource(resourceId: string): Promise<string> {
    return requireEntity(await repository.resourceCourseId(resourceId), "RESOURCE_NOT_FOUND", "El recurso solicitado no existe.");
  }

  return {
    resourceOptions: () => repository.resourceOptions(),

    async getContent(courseId: string, actorId: string, actorRole: AppRole) {
      await assertEditable(courseId, actorId, actorRole);
      return repository.listContent(courseId);
    },

    async createModule(courseId: string, input: CreateModuleInput, actorId: string, actorRole: AppRole) {
      await assertEditable(courseId, actorId, actorRole);
      return repository.createModule(courseId, input, actorId);
    },

    async updateModule(moduleId: string, input: UpdateModuleInput, actorId: string, actorRole: AppRole) {
      await assertEditable(await courseForModule(moduleId), actorId, actorRole);
      return requireEntity(await repository.updateModule(moduleId, input, actorId), "MODULE_NOT_FOUND", "El módulo solicitado no existe.");
    },

    async createLesson(moduleId: string, input: CreateLessonInput, actorId: string, actorRole: AppRole) {
      await assertEditable(await courseForModule(moduleId), actorId, actorRole);
      return repository.createLesson(moduleId, input, actorId);
    },

    async updateLesson(lessonId: string, input: UpdateLessonInput, actorId: string, actorRole: AppRole) {
      await assertEditable(await courseForLesson(lessonId), actorId, actorRole);
      return requireEntity(await repository.updateLesson(lessonId, input, actorId), "LESSON_NOT_FOUND", "La lección solicitada no existe.");
    },

    async createResource(lessonId: string, input: CreateResourceInput, actorId: string, actorRole: AppRole) {
      await assertEditable(await courseForLesson(lessonId), actorId, actorRole);
      return repository.createResource(lessonId, input, actorId);
    },

    async updateResource(resourceId: string, input: UpdateResourceInput, actorId: string, actorRole: AppRole) {
      await assertEditable(await courseForResource(resourceId), actorId, actorRole);
      return requireEntity(await repository.updateResource(resourceId, input, actorId), "RESOURCE_NOT_FOUND", "El recurso solicitado no existe.");
    },

    async uploadFile(courseId: string, body: Buffer, originalName: string, mimeType: string, actorId: string, actorRole: AppRole) {
      await assertEditable(courseId, actorId, actorRole);
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new AppError(422, "EMPTY_FILE", "Debes enviar un archivo.");
      }
      if (body.length > MAX_COURSE_FILE_BYTES) {
        throw new AppError(413, "FILE_TOO_LARGE", "El archivo supera el límite de 25 MB.");
      }
      const normalizedMime = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!allowedMimeTypes.has(normalizedMime)) {
        throw new AppError(415, "UNSUPPORTED_FILE_TYPE", "El tipo de archivo no está permitido.");
      }
      const fileName = safeName(originalName);
      const extension = extname(fileName).slice(1).toLowerCase().slice(0, 20);
      const storedName = `${randomUUID()}${extension ? `.${extension}` : ""}`;
      const storagePath = `courses/${courseId}/${storedName}`;
      const sha256 = createHash("sha256").update(body).digest("hex");
      const typeId = await repository.fileTypeId(normalizedMime);
      if (!typeId) throw new AppError(500, "FILE_TYPE_NOT_CONFIGURED", "El tipo de archivo no está configurado.");

      const { error } = await supabaseAdmin.storage.from(COURSE_CONTENT_BUCKET).upload(storagePath, body, {
        contentType: normalizedMime,
        upsert: false,
      });
      if (error) throw new AppError(502, "STORAGE_UPLOAD_FAILED", "No fue posible almacenar el archivo.");

      try {
        return await repository.createFile({ courseId, actorId, typeId, originalName: fileName, storedName, storagePath, mimeType: normalizedMime, extension, sizeBytes: body.length, sha256 });
      } catch (error) {
        await supabaseAdmin.storage.from(COURSE_CONTENT_BUCKET).remove([storagePath]);
        throw error;
      }
    },
  };
}

export const authoringService = createAuthoringService(authoringRepository);
